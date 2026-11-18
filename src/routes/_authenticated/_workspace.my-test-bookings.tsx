import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/common/page-header";
import { TestBookingStatusDialog } from "@/components/flights/test-booking-status-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { listMyTestBookingsServer } from "@/lib/flights/test-booking-status.functions";
import { useLanguage } from "@/lib/i18n/language-context";

export const Route = createFileRoute("/_authenticated/_workspace/my-test-bookings")({
  head: () => ({ meta: [{ title: "My bookings — Flight Analytics" }] }),
  component: MyTestBookings,
});

function MyTestBookings() {
  const { user } = Route.useRouteContext();
  const { t } = useLanguage();
  const listBookings = useServerFn(listMyTestBookingsServer);
  const bookings = useQuery({
    queryKey: ["my-test-bookings", user.id],
    queryFn: () => listBookings(),
  });

  return (
    <>
      <PageHeader title={t("My bookings")} />
      {bookings.isPending && <p role="status">{t("Loading test bookings…")}</p>}
      {bookings.isError && <p role="alert">{t("Unable to load test bookings.")}</p>}
      {bookings.isSuccess && bookings.data.length === 0 && (
        <p>{t("No personal test bookings yet.")}</p>
      )}
      {bookings.isSuccess && bookings.data.length > 0 && (
        <ul className="grid gap-3">
          {bookings.data.map(({ id, pnr, flight }) => (
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
                  <TestBookingStatusDialog flight={flight} organizationId={null} bookingId={id} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
