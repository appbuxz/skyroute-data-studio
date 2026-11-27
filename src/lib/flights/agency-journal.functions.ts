import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { createSupabaseServerClient } from "../supabase/server";
import { shortlistSnapshotSchema, type ShortlistSnapshot } from "./search-session";

const scopeSchema = z.object({ organizationId: z.string().uuid() });
const pageSize = 25;

export const saveAgencyJournalEntry = createServerFn({ method: "POST" })
  .validator(
    scopeSchema.extend({
      clientLabel: z.string().trim().min(1).max(120),
      snapshot: shortlistSnapshotSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { userId, organizationId } = await requireOrganization(data.organizationId);
    const { error } = await createSupabaseServerClient().from("agency_flight_journal").insert({
      organization_id: organizationId,
      author_id: userId,
      client_label: data.clientLabel,
      snapshot: data.snapshot,
    });
    if (error) throw new Error("Unable to save the journal entry.");
  });

export const listAgencyJournalEntries = createServerFn({ method: "POST" })
  .validator(scopeSchema.extend({ page: z.number().int().min(0).max(1_000_000) }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrganization(data.organizationId);
    const offset = data.page * pageSize;
    const { data: rows, error } = await createSupabaseServerClient()
      .from("agency_flight_journal")
      .select("id, client_label, created_at, snapshot")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize);
    if (error) throw new Error("Unable to load the flight journal.");

    return {
      hasNext: rows.length > pageSize,
      entries: rows.slice(0, pageSize).map((row) => ({
        id: row.id as string,
        clientLabel: row.client_label as string,
        createdAt: row.created_at as string,
        snapshot: parseJournalSnapshot(row.snapshot),
      })),
    };
  });

function parseJournalSnapshot(value: unknown): ShortlistSnapshot | null {
  const parsed = shortlistSnapshotSchema.safeParse(value);
  return parsed.success ? (parsed.data as ShortlistSnapshot) : null;
}
