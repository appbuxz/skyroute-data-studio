// @vitest-environment-options {"url":"https://id-preview--12345678-1234-1234-1234-123456789abc.lovableproject.com"}
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "./previewAuthStorage";
let send: ReturnType<typeof vi.fn>;
let parent: Window;
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
    clear: () => data.clear(),
  });
  send = vi.fn();
  parent = { postMessage: send } as unknown as Window;
  vi.stubGlobal("parent", parent);
  Object.defineProperty(location, "ancestorOrigins", {
    configurable: true,
    value: ["https://lovable.dev"],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function reply(data: unknown, origin = "https://lovable.dev", source: Window = parent) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}
describe("preview session broker boundaries", () => {
  it("accepts only matching request, trusted origin and parent source", async () => {
    const storage = brokeredPreviewStorage()!;
    const pending = storage.setItem("session", "fixture-session");
    const request = send.mock.calls[0]![0];
    expect(send.mock.calls[0]![1]).toBe("https://lovable.dev");
    const response = {
      type: "lovable-preview-auth:result",
      requestId: request.requestId,
      ok: true,
      value: "",
    };
    reply(response, "https://attacker.invalid");
    reply(response, "https://lovable.dev", window);
    reply({ ...response, requestId: "other" });
    expect(localStorage.getItem("session")).toBe("fixture-session");
    reply(response);
    await pending;
    expect(localStorage.getItem("session")).toBeNull();
  });
  it("logout removes local session and informs the trusted broker", async () => {
    localStorage.setItem("session", "fixture-session");
    const pending = brokeredPreviewStorage()!.removeItem("session");
    expect(localStorage.getItem("session")).toBeNull();
    const request = send.mock.calls[0]![0];
    expect(request.type).toBe("lovable-preview-auth:remove");
    reply({
      type: "lovable-preview-auth:result",
      requestId: request.requestId,
      ok: true,
      value: "",
    });
    await pending;
  });
  it("broker logout tombstone clears an existing local session", async () => {
    localStorage.setItem("session", "fixture-session");
    const pending = brokeredPreviewStorage()!.getItem("session");
    const request = send.mock.calls[0]![0];
    reply({
      type: "lovable-preview-auth:result",
      requestId: request.requestId,
      ok: true,
      value: "",
    });
    expect(await pending).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
  });
  it("notifies the broker on logout even when local storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
      removeItem: () => {
        throw Error("blocked");
      },
    });
    const pending = brokeredPreviewStorage()!.removeItem("session");
    const request = send.mock.calls[0]![0];
    expect(request.type).toBe("lovable-preview-auth:remove");
    reply({
      type: "lovable-preview-auth:result",
      requestId: request.requestId,
      ok: true,
      value: "",
    });
    await pending;
  });
});
