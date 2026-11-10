import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export interface ProvisionInput {
  name: string;
  ownerId: string;
  organizationId: string;
}

export function validateInput(input: ProvisionInput): ProvisionInput {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const name = input.name.trim();
  if (!name || name.length > 120 || name.includes("\0")) {
    throw new Error("Name must contain 1–120 characters after trim, without NUL.");
  }
  if (!uuid.test(input.ownerId) || !uuid.test(input.organizationId)) {
    throw new Error("Owner and organization IDs must be valid UUIDs.");
  }
  return {
    name,
    ownerId: input.ownerId.toLowerCase(),
    organizationId: input.organizationId.toLowerCase(),
  };
}

// E literals escape both backslashes and quotes; inputs never become SQL syntax.
function literal(value: string): string {
  return "E'" + value.replaceAll("\\", "\\\\").replaceAll("'", "''") + "'";
}

export function provisioningSql(raw: ProvisionInput): string {
  const input = validateInput(raw);
  let delimiter = "$provision$";
  while (input.name.includes(delimiter)) delimiter = delimiter.replace("$", "$_");
  return `BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;
DO ${delimiter}
DECLARE
  agency_id uuid := ${literal(input.organizationId)};
  owner_id uuid := ${literal(input.ownerId)};
  agency_name text := ${literal(input.name)};
  existing_name text;
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Provisioning requires the postgres administrative session';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(agency_id::text, 0));
  PERFORM 1 FROM auth.users WHERE id = owner_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner must already exist in Auth';
  END IF;
  SELECT name INTO existing_name FROM public.organizations WHERE id = agency_id FOR UPDATE;
  IF FOUND THEN
    IF existing_name IS DISTINCT FROM agency_name OR NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = agency_id AND user_id = owner_id AND role = 'owner'
    ) THEN
      RAISE EXCEPTION 'Organization ID conflicts with existing provisioning';
    END IF;
  ELSE
    INSERT INTO public.organizations (id, name) VALUES (agency_id, agency_name);
    INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (agency_id, owner_id, 'owner');
  END IF;
END
${delimiter};
COMMIT;
`;
}

type Execute = (
  command: string,
  args: string[],
  options: {
    input: string;
    encoding: "utf8";
    timeout: number;
    stdio: ["pipe", "pipe", "pipe"];
    maxBuffer: number;
    env: NodeJS.ProcessEnv;
  },
) => { status: number | null; error?: Error };

export function main(args: string[], env = process.env, execute: Execute = spawnSync): number {
  let input: ProvisionInput;
  try {
    const { values } = parseArgs({
      args,
      options: {
        name: { type: "string" },
        "owner-id": { type: "string" },
        "organization-id": { type: "string" },
      },
    });
    input = validateInput({
      name: values.name ?? "",
      ownerId: values["owner-id"] ?? "",
      organizationId: values["organization-id"] ?? "",
    });
  } catch {
    console.error(
      'Usage: npm run provision:organization -- --name "Agency" --owner-id <existing-auth-uuid> --organization-id <stable-new-uuid>',
    );
    return 1;
  }
  if (!env["PGHOST"] || !env["PGUSER"]) {
    console.error(
      "Set PGHOST and PGUSER explicitly; use PGPASSFILE for administrative credentials.",
    );
    return 1;
  }
  const result = execute(
    "psql",
    ["-X", "--no-password", "--set=ON_ERROR_STOP=1", "--quiet", "--file=-"],
    {
      input: provisioningSql(input),
      encoding: "utf8",
      timeout: 45_000,
      // Capture diagnostics: SQL errors may echo input or connection details.
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
      env,
    },
  );
  if (result.error || result.status !== 0) {
    console.error(
      "Provisioning failed or commit outcome is unknown. Check connection, administrative role, existing Auth user and ID conflicts. Retry only with the SAME organization ID and inputs.",
    );
    return 1;
  }
  console.log(`Organization ${input.organizationId} and owner verified; transaction committed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
