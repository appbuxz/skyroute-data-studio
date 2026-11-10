import { test } from "node:test";
import assert from "node:assert/strict";
import { provisioningSql, validateInput, main } from "./provision-organization.ts";

const input = {
  name: " Agency ",
  ownerId: "f1000000-0000-4000-8000-000000000001",
  organizationId: "f2000000-0000-4000-8000-000000000001",
};

test("normalizes names and UUIDs", () => {
  assert.equal(validateInput({ ...input, ownerId: input.ownerId.toUpperCase() }).name, "Agency");
  assert.equal(
    validateInput({ ...input, ownerId: input.ownerId.toUpperCase() }).ownerId,
    input.ownerId,
  );
});
test("rejects invalid and empty inputs", () => {
  for (const name of ["", "\uFEFF\u00a0", "x".repeat(121), "a\0b"])
    assert.throws(() => validateInput({ ...input, name }));
  for (const field of ["ownerId", "organizationId"])
    assert.throws(() => validateInput({ ...input, [field]: "invalid" }));
});
test("escapes quotes and backslashes, including attempted block termination", () => {
  const sql = provisioningSql({ ...input, name: "O'Reilly \\ $provision$; DROP TABLE x; --" });
  // Dollar delimiters inside an E literal would terminate the outer DO body.
  assert.ok(sql.includes("O''Reilly \\\\"));
  assert.ok(sql.includes("DO $_provision$"));
});
test("requires a genuine postgres session before reading or writing tenant data", () => {
  const sql = provisioningSql(input);
  assert.ok(sql.includes("session_user <> 'postgres' OR current_user <> 'postgres'"));
  assert.ok(sql.indexOf("session_user") < sql.indexOf("FROM auth.users"));
  assert.ok(!sql.includes("SECURITY DEFINER"));
  assert.ok(!sql.includes("SET ROLE"));
});
test("transaction and retry checks cover both inserts, serialize retries and reject conflicts", () => {
  const sql = provisioningSql(input);
  assert.ok(sql.startsWith("BEGIN;"));
  assert.ok(sql.endsWith("COMMIT;\n"));
  assert.ok(sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("INSERT INTO"));
  assert.ok(sql.includes("existing_name IS DISTINCT FROM agency_name OR NOT EXISTS"));
  assert.ok(sql.includes("user_id = owner_id AND role = 'owner'"));
  assert.equal((sql.match(/INSERT INTO/g) ?? []).length, 2);
  assert.ok(!sql.includes("ON CONFLICT DO NOTHING"));
});
test("CLI rejects missing arguments before attempting a connection", () => {
  assert.equal(main([]), 1);
});

const args = [
  "--name",
  input.name,
  "--owner-id",
  input.ownerId,
  "--organization-id",
  input.organizationId,
];
test("requires explicit database configuration before starting psql", () => {
  assert.equal(
    main(args, {}, () => {
      throw new Error("must not execute");
    }),
    1,
  );
});
test("runs one psql session with SQL on stdin and error stop, no password in arguments", () => {
  const env = { PGHOST: "localhost", PGUSER: "postgres", PGPASSWORD: "private-test-value" };
  let calls = 0;
  assert.equal(
    main(args, env, (command, argv, options) => {
      calls++;
      assert.equal(command, "psql");
      assert.ok(argv.includes("--set=ON_ERROR_STOP=1"));
      assert.ok(argv.includes("-X"));
      assert.ok(!argv.join(" ").includes(env.PGPASSWORD));
      assert.equal(options.input, provisioningSql(input));
      assert.equal(options.env, env);
      return { status: 0 };
    }),
    0,
  );
  assert.equal(calls, 1);
});
test("database failure, missing psql and unknown commit outcome fail without automatic retry", () => {
  for (const result of [
    { status: 3 },
    { status: null },
    { status: null, error: new Error("private connection details") },
  ]) {
    let calls = 0;
    assert.equal(
      main(args, { PGHOST: "localhost", PGUSER: "postgres" }, () => {
        calls++;
        return result;
      }),
      1,
    );
    assert.equal(calls, 1);
  }
});
