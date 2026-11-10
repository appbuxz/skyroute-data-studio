import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("./client", () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ client: (handler: unknown) => handler }),
}));
import { attachSupabaseAuth } from "./auth-attacher";
const invoke = attachSupabaseAuth as unknown as (arg: {
  next: (options: unknown) => unknown;
}) => Promise<unknown>;
beforeEach(() => vi.resetAllMocks());
describe("managed RPC bearer transport", () => {
  it("attaches the managed user session to RPC requests", async () => {
    mocks.session.mockResolvedValue({ data: { session: { access_token: "fixture-token" } } });
    const next = vi.fn();
    await invoke({ next });
    expect(next).toHaveBeenCalledWith({ headers: { Authorization: "Bearer fixture-token" } });
  });
  it("does not fabricate a token for signed-out requests", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    const next = vi.fn();
    await invoke({ next });
    expect(next).toHaveBeenCalledWith({ headers: {} });
  });
});
