import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { terminateSession, verifiedUser } from "./session";

function clientWith(getUser: ReturnType<typeof vi.fn>, signOut = vi.fn()) {
  return { auth: { getUser, signOut } } as unknown as Pick<SupabaseClient, "auth">;
}

describe("verified identity", () => {
  it("rejects missing users", async () => {
    expect(await verifiedUser(clientWith(vi.fn().mockResolvedValue({ data: { user: null }, error: null })))).toBeNull();
  });
  it("rejects authentication errors even if a stale user exists", async () => {
    expect(await verifiedUser(clientWith(vi.fn().mockResolvedValue({ data: { user: { id: "stale" } }, error: new Error("Expired") })))).toBeNull();
  });
  it("returns only an identity verified by the authentication service", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    expect((await verifiedUser(clientWith(getUser)))?.id).toBe("verified-user");
    expect(getUser).toHaveBeenCalledOnce();
  });
});

describe("sign-out", () => {
  it("cancels requests and clears private cache before ending the session", async () => {
    const order: string[] = [];
    const signOut = vi.fn(async () => { order.push("signOut"); return { error: null }; });
    await terminateSession(clientWith(vi.fn(), signOut), {
      cancelQueries: async () => { order.push("cancel"); },
      clear: () => { order.push("clear"); },
    });
    expect(order).toEqual(["cancel", "clear", "signOut"]);
  });
  it("reports a failed sign-out rather than pretending it succeeded", async () => {
    await expect(terminateSession(clientWith(vi.fn(), vi.fn().mockResolvedValue({ error: new Error("Offline") })), {
      cancelQueries: async () => {}, clear: () => {},
    })).rejects.toThrow("Offline");
  });
});