vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
import { StrictMode, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightOffer, FlightSearchResult, OrganizationId } from "@/lib/flights/types";
import type { OrganizationMembership } from "@/lib/organizations/session.functions";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  search: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/organizations/session.functions", () => ({
  getOrganizationMemberships: mocks.memberships,
}));
vi.mock("@/lib/flights/search.functions", () => ({ searchFlightsServer: mocks.search }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationWorkspaceProvider } from "@/lib/organizations/workspace-provider";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";
import { OrganizationSelector } from "@/components/layout/organization-selector";
import { Route as SearchRoute } from "@/routes/_authenticated/_workspace.search";
import { Route as AnalysisRoute } from "@/routes/_authenticated/_workspace.analysis";

const USER = "f1000000-0000-4000-8000-000000000001";
const A = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
const B = "f2000000-0000-4000-8000-000000000002" as OrganizationId;
const agencies: OrganizationMembership[] = [
  { organizationId: A, organizationName: "Agency A", role: "owner" },
  { organizationId: B, organizationName: "Agency B", role: "member" },
];
const SearchPage = SearchRoute.options.component!;
const AnalysisPage = AnalysisRoute.options.component!;
const LEGACY_KEY = "flight-analytics:search:v1";

function result(carrier = "A Airways"): FlightSearchResult {
  const offer: FlightOffer = {
    id: carrier,
    carrier,
    flightNumber: "KC100",
    origin: "ALA",
    destination: "IST",
    departureAt: "2099-12-10T10:00:00+05:00",
    arrivalAt: "2099-12-10T14:00:00+03:00",
    stops: 0,
    cabinClass: "economy",
    price: { amount: 100000, currency: "KZT" },
  };
  return { status: "ok", offers: [offer], fetchedAt: "2026-11-10T10:00:00Z" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Workspace({ initialPage = "search" }: { initialPage?: "search" | "analysis" }) {
  const [page, setPage] = useState(initialPage);
  return (
    <OrganizationWorkspaceProvider userId={USER}>
      <OrganizationSelector />
      <SelectionState />
      <button onClick={() => setPage("search")}>Search tab</button>
      <button onClick={() => setPage("analysis")}>Analysis tab</button>
      {page === "search" ? <SearchPage /> : <AnalysisPage />}
    </OrganizationWorkspaceProvider>
  );
}

function SelectionState() {
  const { selectedOrganizationId } = useOrganizationWorkspace();
  return (
    <output aria-label="Selected organization state">{selectedOrganizationId ?? "none"}</output>
  );
}

function select(id: string) {
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: id } });
}

function submitSearch() {
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "ALA" } });
  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "IST" } });
  fireEvent.change(screen.getByLabelText("Departure date"), { target: { value: "2099-12-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("Organization")).not.toBeDisabled());
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  mocks.memberships.mockResolvedValue(agencies);
  mocks.search.mockResolvedValue(result());
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("organization workspace", () => {
  it("disables search during membership loading", async () => {
    const loading = deferred<OrganizationMembership[]>();
    mocks.memberships.mockReturnValue(loading.promise);
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(screen.getAllByText("Loading organizations…").length).toBeGreaterThan(0);
    expect(mocks.search).not.toHaveBeenCalled();
    await act(async () => loading.resolve([]));
  });

  it("shows an assignment message and blocks users without organizations", async () => {
    mocks.memberships.mockResolvedValue([]);
    render(<Workspace />);
    await screen.findAllByText(/No organization assigned/);
    expect(screen.getByLabelText("Organization")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    submitSearch();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("automatically selects one organization and sends it to search", async () => {
    mocks.memberships.mockResolvedValue([agencies[0]]);
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({
      data: {
        origin: "ALA",
        destination: "IST",
        departureDate: "2099-12-10",
        returnDate: undefined,
        passengers: 1,
        cabinClass: "economy",
        organizationId: A,
      },
    });
  });

  it("requires explicit selection with multiple memberships", async () => {
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    select(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    submitSearch();
    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    expect(mocks.search.mock.calls[0]?.[0].data.organizationId).toBe(B);
  });

  it("preserves form validation after selecting an organization", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.getAllByText("Enter a 3-letter airport code")).toHaveLength(2);
  });

  it("keeps analysis in React memory and clears both views when switching", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.getByText("Carrier comparison")).toBeInTheDocument();
    select(B);
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    select(A);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Search tab"));
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
  });

  it("immediately clears visible offers on a search-page organization switch", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    select(B);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    // Flight input values are preserved even though tenant results are cleared.
    expect(screen.getByLabelText("Origin")).toHaveValue("ALA");
  });

  it("ignores an old response without clearing a newer pending search", async () => {
    const old = deferred<FlightSearchResult>();
    const current = deferred<FlightSearchResult>();
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    submitSearch();
    await act(async () => old.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await act(async () => current.resolve(result("B Airways")));
    expect(screen.getByText(/B Airways · KC100/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.getByText("Carrier comparison")).toBeInTheDocument();
  });

  it("resets pending on switching even if the old request never settles, without unlocking a newer request", async () => {
    const old = deferred<FlightSearchResult>();
    const current = deferred<FlightSearchResult>();
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();

    select(B);
    // Do not settle A: changing scope alone must release its pending UI.
    expect(screen.queryByRole("button", { name: "Checking…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    submitSearch();
    expect(mocks.search).toHaveBeenCalledTimes(2);

    // An old rejection runs finally too, but cannot unlock the newer request.
    await act(async () => old.reject(new Error("Old request failed")));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await act(async () => current.resolve(result("B Airways")));
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    expect(screen.getByText(/B Airways · KC100/)).toBeInTheDocument();
  });

  it("rejects old results even after switching away and back to the same organization", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    select(A);
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("ignores an old rejection after switching organizations", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    await act(async () => pending.reject({ statusCode: 403 }));
    expect(screen.getByLabelText("Organization")).toHaveValue(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    expect(screen.queryByText(/no longer have access/)).not.toBeInTheDocument();
  });

  it("does not publish results after the search page unmounts", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    fireEvent.click(screen.getByText("Analysis tab"));
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("blocks a denied selection, clears prior analysis, and never falls back", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    mocks.search.mockRejectedValue({ code: "ORGANIZATION_ACCESS_DENIED", statusCode: 403 });
    submitSearch();
    await screen.findAllByText(/You no longer have access/);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(mocks.search).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("does not automatically substitute the only remaining organization after revocation", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    mocks.memberships.mockResolvedValue([agencies[1]]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    select(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
  });

  it("shows sanitized listing failures and permits explicit retry", async () => {
    mocks.memberships.mockRejectedValueOnce(new Error("private database details"));
    render(<Workspace />);
    await screen.findAllByText("Unable to load organizations. Please try again.");
    expect(screen.queryByText(/private database details/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
  });

  it.each(["automatic", "explicit"])(
    "clears an %s selection on reload failure and requires selection after retry",
    async (selection) => {
      mocks.memberships.mockResolvedValue(selection === "automatic" ? [agencies[0]] : agencies);
      render(<Workspace />);
      await ready();
      if (selection === "explicit") select(A);
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent(A);
      submitSearch();
      await screen.findByText(/A Airways · KC100/);

      mocks.memberships.mockRejectedValueOnce(new Error("Membership reload failed"));
      fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
      await screen.findAllByText("Unable to load organizations. Please try again.");
      // Check React context itself: a select with no options can look empty even
      // when its controlled selection state incorrectly retains an old ID.
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent("none");
      expect(screen.getByLabelText("Organization")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
      expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();

      mocks.memberships.mockResolvedValue([agencies[1]]);
      fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
      await ready();
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent("none");
      expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
      select(B);
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent(B);
      expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    },
  );

  it.each([
    [{ statusCode: 401 }, /Your session has expired/],
    [{ message: "Organization selection required" }, /Select an organization before searching/],
    [{ statusCode: 503 }, /Unable to verify organization access/],
  ])("shows clear authorization errors %j", async (error, message) => {
    mocks.search.mockRejectedValue(error);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findAllByText(message as RegExp);
    expect(screen.queryByText("Flight offers (1)")).not.toBeInTheDocument();
  });

  it("never loads legacy snapshots, including snapshots added after mount", async () => {
    window.sessionStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ userId: USER, offers: (result() as { offers: FlightOffer[] }).offers }),
    );
    render(<Workspace initialPage="analysis" />);
    await ready();
    expect(window.sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    select(A);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    window.sessionStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ userId: USER, offers: [{ carrier: "LEGACY Airways" }] }),
    );
    select(B);
    expect(screen.queryByText(/LEGACY Airways/)).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("does not persist selection or successful searches and requires selection after remount", async () => {
    const sessionWrite = vi.spyOn(Storage.prototype, "setItem");
    const first = render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(sessionWrite).not.toHaveBeenCalled();
    first.unmount();
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
  });

  it("invalidates outstanding results when the authenticated account changes", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    const listener = mocks.onAuthStateChange.mock.calls[0]?.[0] as (
      event: string,
      session: { user: { id: string } } | null,
    ) => void;
    act(() => listener("SIGNED_IN", { user: { id: "different-user" } }));
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(screen.getAllByText("Your session has changed. Sign in again.").length).toBeGreaterThan(
      0,
    );
  });

  it("works with React StrictMode effect cleanup and replay", async () => {
    mocks.memberships.mockResolvedValue([agencies[0]]);
    render(
      <StrictMode>
        <Workspace />
      </StrictMode>,
    );
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
  });
});
