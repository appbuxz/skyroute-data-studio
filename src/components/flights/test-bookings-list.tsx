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
    <ul className="grid gap-3">
      {bookings.map(({ id, pnr, flight }) => (
        <li key={id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <h2 className="font-medium">
                  {flight.from} → {flight.to}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {flight.carrier}
                  {flight.flightNumber} · {flight.departureDate} · PNR {pnr}
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
