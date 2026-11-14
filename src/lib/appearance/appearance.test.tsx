import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "./appearance-provider";
import { APPEARANCE_INIT_SCRIPT, APPEARANCE_KEY } from "./theme";
import { Route as SettingsRoute } from "@/routes/_authenticated/_workspace.settings";

let systemDark = false;
let listeners: Set<() => void>;
const Settings = SettingsRoute.options.component!;
function openSettings() {
  return render(
    <AppearanceProvider>
      <Settings />
    </AppearanceProvider>,
  );
}
function changeSystem(dark: boolean) {
  act(() => {
    systemDark = dark;
    listeners.forEach((listener) => listener());
  });
}
function expectDark(dark: boolean) {
  expect(document.documentElement.classList.contains("dark")).toBe(dark);
  expect(document.documentElement.style.colorScheme).toBe(dark ? "dark" : "light");
}

beforeEach(() => {
  // Use DOM Storage rather than Node’s native localStorage in the test environment.
  vi.stubGlobal("localStorage", window.sessionStorage);
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  systemDark = false;
  listeners = new Set();
  vi.spyOn(window, "matchMedia").mockImplementation(
    () =>
      ({
        get matches() {
          return systemDark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_event: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_event: string, listener: () => void) => {
          listeners.delete(listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("workspace appearance settings", () => {
  it("is available without an organization and defaults to System", () => {
    expect(SettingsRoute.options.beforeLoad).toBeUndefined();
    openSettings();
    expect(screen.getByRole("radio", { name: "System", checked: true })).toBeInTheDocument();
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBeNull();
    expectDark(false);
    changeSystem(true);
    expectDark(true);
    changeSystem(false);
    expectDark(false);
  });
  it("applies and saves explicit choices immediately, ignoring OS changes", () => {
    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expectDark(true);
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe("dark");
    changeSystem(false);
    expectDark(true);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expectDark(false);
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe("light");
    changeSystem(true);
    expectDark(false);
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expectDark(true);
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe("system");
    changeSystem(false);
    expectDark(false);
  });
  it("restores a saved preference when the page mounts again", () => {
    const first = openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    first.unmount();
    document.documentElement.classList.remove("dark");
    openSettings();
    expectDark(true);
    expect(screen.getByRole("radio", { name: "Dark", checked: true })).toBeInTheDocument();
  });
  it("works when localStorage cannot be read or written", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expectDark(true);
    expect(screen.getByRole("radio", { name: "Dark", checked: true })).toBeInTheDocument();
  });
  it("syncs another tab's preference and removes OS listeners on unmount", () => {
    const view = openSettings();
    const event = new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: "dark" });
    Object.defineProperty(event, "storageArea", { value: window.localStorage });
    act(() => window.dispatchEvent(event));
    expectDark(true);
    expect(screen.getByRole("radio", { name: "Dark", checked: true })).toBeInTheDocument();
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(listeners.size).toBe(0);
  });
});

describe("appearance before hydration", () => {
  it.each([
    ["light", true, false],
    ["dark", false, true],
    ["system", true, true],
    ["system", false, false],
    [null, true, true],
    ["invalid", false, false],
  ])("applies %s with OS dark=%s before React mounts", (stored, osDark, expected) => {
    if (stored) window.localStorage.setItem(APPEARANCE_KEY, stored);
    systemDark = osDark;
    new Function("localStorage", "matchMedia", "document", APPEARANCE_INIT_SCRIPT)(
      window.localStorage,
      window.matchMedia,
      document,
    );
    expectDark(expected);
    openSettings();
    expectDark(expected);
  });
});
