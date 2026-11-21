import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Route } from "@/routes/_authenticated/_workspace.my-test-bookings";

const mocks = vi.hoisted(() => ({ list: vi.fn(), details: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/flights/test-booking-status.functions", () => ({
  listMyTestBookingsServer: mocks.list,
  getTestBookingStatusServer: mocks.details,
}));

it("updates only the opened personal row with existing status details", async () => {
  const firstId = "a".repeat(64);
  const secondId = "b".repeat(64);
  const flight = {
    from: "ALA",
    to: "IST",
    departureDate: "2026-12-15",
    carrier: "KC",
    flightNumber: "911",
  };
  mocks.list.mockResolvedValue([
    { id: firstId, pnr: "TEST01", flight },
    { id: secondId, pnr: "TEST02", flight },
  ]);
  mocks.details
    .mockResolvedValueOnce({
      status: "retrieved",
      pnr: "TEST01",
      bookingStatus: "Confirmed",
      ticketNumbers: ["0001234567890"],
    })
    .mockResolvedValueOnce({ status: "retrieved", pnr: "TEST02", bookingStatus: "Confirmed" });
  const context = vi.spyOn(Route, "useRouteContext").mockReturnValue({ user: { id: "user" } });
  try {
    const client = new QueryClient();
    const Page = Route.options.component!;
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    const [first, second] = within(
      await screen.findByRole("list", { name: "My bookings" }),
    ).getAllByRole("listitem");
    expect(within(first!).getByText("Saved")).toBeInTheDocument();
    expect(within(first!).getByText("15 Dec 2026")).toBeInTheDocument();
    expect(within(first!).getByText("Test booking · no payment")).toBeInTheDocument();
    expect(within(first!).getByText("TEST01")).toBeInTheDocument();
    expect(mocks.details).not.toHaveBeenCalled();

    fireEvent.click(within(first!).getByRole("button", { name: "Open test booking" }));
    const firstDialog = await screen.findByRole("dialog");
    expect(await within(firstDialog).findByText(/0001234567890/)).toBeInTheDocument();
    fireEvent.click(within(firstDialog).getByRole("button", { name: "Close" }));
    expect(within(first!).getByText("Electronic ticket")).toBeInTheDocument();
    expect(within(first!).getByText("0001234567890")).toBeInTheDocument();
    expect(within(second!).getByText("Saved")).toBeInTheDocument();

    fireEvent.click(within(second!).getByRole("button", { name: "Open test booking" }));
    const secondDialog = await screen.findByRole("dialog");
    expect(
      await within(secondDialog).findByText("Ticket number not yet received"),
    ).toBeInTheDocument();
    fireEvent.click(within(secondDialog).getByRole("button", { name: "Close" }));
    expect(within(second!).getByText("Confirmed")).toBeInTheDocument();
    expect(within(second!).queryByText("Electronic ticket")).not.toBeInTheDocument();
    expect(mocks.details.mock.calls).toEqual([
      [{ data: { bookingId: firstId } }],
      [{ data: { bookingId: secondId } }],
    ]);
  } finally {
    context.mockRestore();
  }
});
