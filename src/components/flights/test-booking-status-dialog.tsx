import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getTestBookingStatusServer } from "@/lib/flights/test-booking-status.functions";
import type { TestBookingStatus } from "@/lib/flights/test-booking-status.server";
import type { TestBookingFlight } from "@/lib/flights/test-booking-flight";
import type { OrganizationId } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

export function TestBookingStatusDialog({
  flight,
  organizationId,
  bookingId,
  onStatusRetrieved,
}: {
  flight: TestBookingFlight;
  organizationId: OrganizationId | null;
  bookingId?: string;
  onStatusRetrieved?: (result: Extract<TestBookingStatus, { status: "retrieved" }>) => void;
}) {
  const { t, dateTime } = useLanguage();
  const getStatus = useServerFn(getTestBookingStatusServer);
  const [result, setResult] = useState<TestBookingStatus | null>(null);
  const request = useRef(0);

  async function onOpenChange(open: boolean) {
    const current = ++request.current;
    if (!open) return;
    setResult(null);
    try {
      const response = await getStatus({
        data: {
          ...(bookingId ? { bookingId } : { flight }),
          ...(organizationId ? { organizationId } : {}),
        },
      });
      if (current === request.current) {
        setResult(response);
        if (response.status === "retrieved") onStatusRetrieved?.(response);
      }
    } catch {
      if (current === request.current) setResult({ status: "error" });
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("Open test booking")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {flight.from} → {flight.to}
          </DialogTitle>
          <DialogDescription>{t("Test booking · no payment")}</DialogDescription>
        </DialogHeader>
        <p>
          {flight.carrier} · {flight.flightNumber}
        </p>
        <div role="status" className="space-y-2 text-sm">
          {!result && t("Updating booking status…")}
          {result && "pnr" in result && (
            <p>
              PNR <strong>{result.pnr}</strong>
            </p>
          )}
          {result?.status === "retrieved" && (
            <dl className="grid grid-cols-2 gap-2">
              <dt>{t("Booking status")}</dt>
              <dd>{result.bookingStatus}</dd>
              {bookingId && (
                <>
                  <dt>{t("Electronic ticket")}</dt>
                  <dd>
                    {result.ticketNumbers?.length
                      ? `${t("Issued")} · ${result.ticketNumbers.join(", ")}`
                      : t("Ticket number not yet received")}
                  </dd>
                </>
              )}
              {result.ticketingDeadline && (
                <>
                  <dt>{t("Ticketing deadline")}</dt>
                  <dd>{dateTime(result.ticketingDeadline)}</dd>
                </>
              )}
            </dl>
          )}
          {result?.status === "not_found" && t("No test booking found for this flight.")}
          {(result?.status === "provider_error" || result?.status === "error") &&
            t("Unable to update booking status.")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
