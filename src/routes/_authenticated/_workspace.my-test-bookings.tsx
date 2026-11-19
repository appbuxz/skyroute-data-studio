import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/common/page-header";
import { TestBookingsList } from "@/components/flights/test-bookings-list";
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
        <TestBookingsList bookings={bookings.data} organizationId={null} />
      )}
    </>
  );
}
