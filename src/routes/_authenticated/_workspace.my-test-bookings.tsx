import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState, PageHeader } from "@/components/common/page-header";
import { CalendarCheck, Info, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { TestBookingStatusDialog } from "@/components/flights/test-booking-status-dialog";
import { Card, CardContent } from "@/components/ui/card";
import type { TestBookingStatus } from "@/lib/flights/test-booking-status.server";
import type { TestBookingFlight } from "@/lib/flights/test-booking-flight";
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
    <div className="workspace-personal-bookings">
      <PageHeader
        title={t("My bookings")}
        description={t(
          "View your saved test bookings and open a booking to check its latest status.",
        )}
      />
      {bookings.isPending && (
        <Card className="shadow-none">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderCircle
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p role="status">{t("Loading test bookings…")}</p>
          </CardContent>
        </Card>
      )}
      {bookings.isError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/35 bg-card p-4 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p>{t("Unable to load test bookings.")}</p>
        </div>
      )}
      {bookings.isSuccess &&
        (bookings.data.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-5" aria-hidden="true" />}
            title={t("No personal test bookings yet.")}
            description={t("Test bookings you save from flight search appear here.")}
          />
        ) : (
          <ul aria-label={t("My bookings")} className="grid gap-3">
            {bookings.data.map((booking) => (
              <PersonalBooking
                key={JSON.stringify([user.id, booking.id, booking.pnr])}
                booking={booking}
              />
            ))}
          </ul>
        ))}
    </div>
  );
}

function PersonalBooking({
  booking: { id, pnr, flight },
}: {
  booking: { id: string; pnr: string; flight: TestBookingFlight };
}) {
  const { t, date } = useLanguage();
  const [retrieved, setRetrieved] = useState<Extract<TestBookingStatus, { status: "retrieved" }>>();
  return (
    <li>
      <Card className="shadow-none">
        <CardContent className="personal-booking-card">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {flight.from} → {flight.to}
            </h2>
            <p className="text-sm text-muted-foreground">
              {flight.carrier} · {flight.flightNumber}
            </p>
            <p className="mt-2 w-fit rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground">
              {t("Test booking · no payment")}
            </p>
          </div>
          <dl className="personal-booking-fields grid min-w-0 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("Departure date")}</dt>
              <dd className="font-medium">
                <time dateTime={flight.departureDate}>
                  {date(new Date(flight.departureDate), "UTC")}
                </time>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">
                {t(retrieved ? "Last checked booking status" : "Booking status")}
              </dt>
              <dd className="break-words font-semibold">
                {retrieved?.bookingStatus ?? t("Saved")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">PNR</dt>
              <dd className="break-words font-medium tabular-nums">{pnr}</dd>
            </div>
            {!!retrieved?.ticketNumbers?.length && (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("Electronic ticket")}</dt>
                <dd className="break-words font-medium tabular-nums">
                  {retrieved.ticketNumbers.join(", ")}
                </dd>
              </div>
            )}
          </dl>
          <TestBookingStatusDialog
            flight={flight}
            organizationId={null}
            bookingId={id}
            onStatusRetrieved={setRetrieved}
          />
        </CardContent>
      </Card>
    </li>
  );
}
