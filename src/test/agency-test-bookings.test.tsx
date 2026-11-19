import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/_workspace.agency-test-bookings";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  workspace: {
    selectedOrganizationId: "agency-a",
    userId: "user",
    version: 1,
    canSearch: true,
    status: "ready",
  },
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => mocks.list,
  createServerFn: () => {
    const builder = { validator: () => builder, handler: () => undefined };
    return builder;
  },
}));
vi.mock("@/lib/organizations/agency-access", () => ({ requireAgencyWorkspace: vi.fn() }));
vi.mock("@/lib/flights/test-booking-status.functions", () => ({
  listAgencyTestBookingsServer: vi.fn(),
  getTestBookingStatusServer: vi.fn(),
}));
vi.mock("@/lib/organizations/workspace-context", () => ({
  useOrganizationWorkspace: () => mocks.workspace,
}));
vi.mock("@/lib/i18n/language-context", () => ({
  useLanguage: () => ({ t: (text: string) => text }),
}));

function booking(pnr: string) {
  return {
    id: pnr,
    pnr,
    flight: {
      from: "ALA",
      to: "IST",
      carrier: "KC",
      flightNumber: "913",
      departureDate: "2026-12-15",
    },
  };
}

it("clears the previous agency's rows and ignores its late response", async () => {
  let finishOldRequest!: (value: ReturnType<typeof booking>[]) => void;
  mocks.list
    .mockResolvedValueOnce([booking("ABC123")])
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldRequest = resolve;
        }),
    )
    .mockResolvedValueOnce([booking("DEF456")]);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = Route.options.component!;
  const page = () => (
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
  const { rerender } = render(page());
  expect(await screen.findByText(/ABC123/)).toBeInTheDocument();

  const refresh = client.invalidateQueries({ queryKey: ["agency-test-bookings"] });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  mocks.workspace.selectedOrganizationId = "agency-b";
  mocks.workspace.version += 1;
  rerender(page());

  expect(screen.queryByText(/ABC123/)).not.toBeInTheDocument();
  expect(await screen.findByText(/DEF456/)).toBeInTheDocument();
  await act(async () => {
    finishOldRequest([booking("LATE12")]);
    await refresh;
  });
  expect(screen.queryByText(/LATE12/)).not.toBeInTheDocument();
});
