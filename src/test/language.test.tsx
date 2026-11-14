import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_INIT_SCRIPT,
  LANGUAGE_KEY,
  createTranslator,
  type Language,
} from "@/lib/i18n/language";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  memberships: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/flights/search.functions", () => ({ searchFlightsServer: mocks.search }));
vi.mock("@/lib/organizations/session.functions", () => ({
  getOrganizationMemberships: mocks.memberships,
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: () => "/search",
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { LanguageProvider } from "@/lib/i18n/language-provider";
import { AppearanceProvider } from "@/lib/appearance/appearance-provider";
import { OrganizationWorkspaceProvider } from "@/lib/organizations/workspace-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Route as SearchRoute } from "@/routes/_authenticated/_workspace.search";
import { Route as SettingsRoute } from "@/routes/_authenticated/_workspace.settings";
import { analyticsSnapshot } from "./fixtures/agency-analysis";

const Search = SearchRoute.options.component!;
const Settings = SettingsRoute.options.component!;
const cases = [
  {
    language: "en",
    autonym: "English",
    settings: "Settings",
    search: "Search flights",
    origin: "Origin",
    destination: "Destination",
    date: "Departure date",
    invalid: "Enter a 3-letter airport code",
    empty: "No flights found for the selected route and date.",
    pending: "Checking…",
    unavailable: "Flight search unavailable",
    error: "Travelport flight search API is not configured.",
    disclosure: "Potential price difference 1 comparison group",
    outbound: "Outbound itinerary",
  },
  {
    language: "ru",
    autonym: "Русский",
    settings: "Настройки",
    search: "Найти рейсы",
    origin: "Откуда",
    destination: "Куда",
    date: "Дата вылета",
    invalid: "Введите код аэропорта из 3 букв",
    empty: "На выбранный маршрут и дату рейсы не найдены.",
    pending: "Поиск…",
    unavailable: "Поиск рейсов недоступен",
    error: "Поиск рейсов Travelport ещё не настроен.",
    disclosure: "Возможная разница цен 1 группа сравнения",
    outbound: "Маршрут туда",
  },
  {
    language: "kk",
    autonym: "Қазақша",
    settings: "Баптаулар",
    search: "Рейстерді іздеу",
    origin: "Қайдан",
    destination: "Қайда",
    date: "Ұшу күні",
    invalid: "Әуежайдың 3 әріптік кодын енгізіңіз",
    empty: "Таңдалған бағыт пен күнге рейстер табылмады.",
    pending: "Ізделуде…",
    unavailable: "Рейстерді іздеу қолжетімсіз",
    error: "Travelport рейстерін іздеу әлі бапталмаған.",
    disclosure: "Ықтимал баға айырмасы 1 салыстыру тобы",
    outbound: "Бару бағыты",
  },
] as const;
function page() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppearanceProvider>
        <LanguageProvider>
          <OrganizationWorkspaceProvider userId="personal-user">
            <AppShell>
              <Settings />
              <Search />
            </AppShell>
          </OrganizationWorkspaceProvider>
        </LanguageProvider>
      </AppearanceProvider>
    </QueryClientProvider>,
  );
}
function fill(labels: (typeof cases)[number]) {
  fireEvent.change(screen.getByLabelText(labels.origin), { target: { value: "ALA" } });
  fireEvent.change(screen.getByLabelText(labels.destination), { target: { value: "IST" } });
  fireEvent.change(screen.getByLabelText(labels.date), { target: { value: "2099-12-10" } });
}
async function ready(labels: (typeof cases)[number]) {
  await waitFor(() => expect(screen.getByRole("button", { name: labels.search })).toBeEnabled());
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("localStorage", window.sessionStorage);
  window.localStorage.clear();
  document.documentElement.lang = "en";
  mocks.memberships.mockResolvedValue([]);
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  const snapshot = analyticsSnapshot();
  snapshot.offers[2]!.price = { amount: 500, currency: "USD" };
  mocks.search.mockResolvedValue({
    status: "ok",
    offers: snapshot.offers,
    fetchedAt: snapshot.fetchedAt,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
  document.documentElement.classList.remove("dark");
});

describe.each(cases)("$language workspace", (labels) => {
  it("translates settings, menu, form, validation and complete results without changing IATA or currencies", async () => {
    window.localStorage.setItem(LANGUAGE_KEY, labels.language);
    page();
    await ready(labels);
    expect(document.documentElement.lang).toBe(labels.language);
    expect(screen.getByRole("link", { name: labels.settings })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("radio", { name: labels.autonym, checked: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: labels.search }));
    expect(screen.getAllByText(labels.invalid)).toHaveLength(2);
    fill(labels);
    fireEvent.click(screen.getByRole("button", { name: labels.search }));
    await screen.findByRole("button", { name: labels.disclosure });
    const formatter = createTranslator(labels.language);
    expect(
      screen.getAllByText(`${formatter.number(180000).replace(/\s/g, " ")} KZT`).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(`${formatter.number(500)} USD`)).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: labels.outbound })).toHaveLength(3);
    expect(screen.getByLabelText(labels.date)).toHaveValue(
      labels.language === "en" ? "10/12/2099" : "10.12.2099",
    );
    expect(screen.getByLabelText(labels.origin)).toHaveValue("ALA");
    expect(screen.getByLabelText(labels.destination)).toHaveValue("IST");
    fireEvent.click(screen.getByRole("button", { name: labels.disclosure }));
    const date = document.querySelector('time[datetime="2099-12-10T08:00:00+05:00"]');
    expect(date?.textContent).toContain("08:00 (UTC+05:00)");
    expect(date?.textContent).toContain(
      new Intl.DateTimeFormat(formatter.locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date("2099-12-10T00:00:00Z")),
    );
    expect(mocks.search).toHaveBeenCalledOnce();
    expect(mocks.search.mock.calls[0]![0].data).not.toHaveProperty("organizationId");
  });
  it("translates loading, empty results and provider errors", async () => {
    window.localStorage.setItem(LANGUAGE_KEY, labels.language);
    let resolve!: (value: unknown) => void;
    mocks.search.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    page();
    await ready(labels);
    fill(labels);
    fireEvent.click(screen.getByRole("button", { name: labels.search }));
    expect(screen.getByRole("button", { name: labels.pending })).toBeDisabled();
    await act(async () => resolve({ status: "ok", offers: [], fetchedAt: "2026-11-14T10:35:00Z" }));
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
    mocks.search.mockResolvedValueOnce({
      status: "not_connected",
      message: "Travelport flight search API is not configured.",
    });
    fireEvent.click(screen.getByRole("button", { name: labels.search }));
    await screen.findByText(labels.unavailable);
    expect(screen.getByText(labels.error)).toBeInTheDocument();
  });
  it("applies and persists the language choice across a remount and initializes html lang before hydration", async () => {
    const view = page();
    await ready(cases[0]);
    if (labels.language === "en") fireEvent.click(screen.getByRole("radio", { name: "Русский" }));
    fireEvent.click(screen.getByRole("radio", { name: labels.autonym }));
    expect(document.documentElement.lang).toBe(labels.language);
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe(labels.language);
    view.unmount();
    document.documentElement.lang = "en";
    new Function("localStorage", "document", LANGUAGE_INIT_SCRIPT)(window.localStorage, document);
    expect(document.documentElement.lang).toBe(labels.language);
    page();
    await ready(labels);
    expect(screen.getByRole("radio", { name: labels.autonym, checked: true })).toBeInTheDocument();
  });
});

it("updates visible validation errors immediately without resubmitting or losing form values", async () => {
  page();
  await ready(cases[0]);
  fireEvent.click(screen.getByRole("button", { name: cases[0].search }));
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "ALA" } });
  fireEvent.click(screen.getByRole("radio", { name: "Русский" }));
  expect(screen.getAllByText(cases[1].invalid)).toHaveLength(2);
  expect(screen.getByLabelText("Откуда")).toHaveValue("ALA");
  expect(mocks.search).not.toHaveBeenCalled();
});

it("defaults invalid or unavailable preferences to English and keeps switching usable without storage", async () => {
  window.localStorage.setItem(LANGUAGE_KEY, "invalid");
  page();
  await ready(cases[0]);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  fireEvent.click(screen.getByRole("radio", { name: "Қазақша" }));
  expect(document.documentElement.lang).toBe("kk");
  expect(screen.getByRole("button", { name: cases[2].search })).toBeEnabled();
});

it.each(["kk", "ru", "en"] as Language[])(
  "localizes safe failures and never exposes unrecognized backend details in %s",
  (language) => {
    const { message, t } = createTranslator(language);
    expect(message("private database details")).toBe(
      t("Unable to complete the flight search request. Please try again."),
    );
    expect(message("Travelport returned no supported flight offers (unknown_kind).")).toBe(
      t("No supported flight offers were returned."),
    );
  },
);

it("formats Kazakh months and separators even when browser ICU locale data is incomplete", () => {
  const formatter = createTranslator("kk");
  expect(formatter.number(180000.5)).toBe("180\u00a0000,5");
  expect(formatter.date(new Date("2099-12-10T23:30:00Z"), "UTC")).toBe("2099 ж. 10 жел.");
  expect(formatter.date(new Date("2099-01-01T00:00:00Z"), "UTC")).toBe("2099 ж. 1 қаң.");
});
