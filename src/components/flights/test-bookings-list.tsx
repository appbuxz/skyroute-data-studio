import { TestBookingStatusDialog } from "@/components/flights/test-booking-status-dialog";
import { Card, CardContent } from "@/components/ui/card";
import type { TestBookingFlight } from "@/lib/flights/test-booking-flight";
import type { OrganizationId } from "@/lib/flights/types";

export function TestBookingsList({
  bookings,
  organizationId,
}: {
  bookings: { id: string; pnr: string; flight: TestBookingFlight }[];
  organizationId: OrganizationId | null;
}) {
  return (
    <ul className="workspace-bookings grid gap-3">
      {bookings.map(({ id, pnr, flight }) => (
        <li key={id}>
          <Card>
            <CardContent className="workspace-booking-row flex flex-wrap items-center justify-between gap-3 pt-5">
              <div className="workspace-booking-details min-w-0">
                <h2 className="font-medium">
                  {flight.from} → {flight.to}
                </h2>
                <p className="workspace-booking-meta text-sm text-muted-foreground">
                  <span>{flight.carrier}{flight.flightNumber}</span>
                  <span className="workspace-booking-separator"> · </span>
                  <time dateTime={flight.departureDate}>{flight.departureDate}</time>
                  <span className="workspace-booking-separator"> · </span>
                  <span>PNR {pnr}</span>
                </p>
              </div>
              <TestBookingStatusDialog
                flight={flight}
                organizationId={organizationId}
                bookingId={id}
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
