import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { TestBookingStatus } from "@/lib/flights/test-booking-status.server";
import { TestBookingStatusDialog } from "./test-booking-status-dialog";

const getStatus = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/flights/test-booking-status.functions", () => ({
  getTestBookingStatusServer: getStatus,
}));

afterEach(() => {
  cleanup();
  getStatus.mockReset();
});

const flight = {
  carrier: "KC",
  flightNumber: "913",
  from: "ALA",
  to: "IST",
  departureDate: "2026-12-12",
};
const retrieved = { status: "retrieved", pnr: "ABC123", bookingStatus: "HK · Confirmed" } as const;
const cases: [TestBookingStatus, string, boolean][] = [
  [{ ...retrieved, ticketNumbers: ["0019905292727"] }, "Issued · 0019905292727", true],
  [retrieved, "Ticket number not yet received", true],
  [{ status: "provider_error", pnr: "ABC123" }, "Unable to update booking status.", false],
];

it.each(cases)(
  "shows the ticket state returned for a saved booking (%s)",
  async (result, message, showsField) => {
    getStatus.mockResolvedValue(result);
    render(
      <TestBookingStatusDialog flight={flight} organizationId={null} bookingId="saved-booking" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open test booking" }));

    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText(message)).toBeVisible();
    if (showsField) {
      expect(dialog.getByText("Electronic ticket")).toBeVisible();
    } else {
      expect(dialog.queryByText("Ticket number not yet received")).not.toBeInTheDocument();
      expect(dialog.queryByText("Electronic ticket")).not.toBeInTheDocument();
    }
    expect(getStatus).toHaveBeenCalledExactlyOnceWith({ data: { bookingId: "saved-booking" } });
  },
);
