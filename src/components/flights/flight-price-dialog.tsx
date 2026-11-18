import { type FormEvent, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckoutFareRules } from "./checkout-fare-rules";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  confirmFlightPriceServer,
  createFlightTestBookingServer,
} from "@/lib/flights/flight-price.functions";
import type {
  FlightOffer,
  FlightPriceConfirmation,
  FlightTestBooking,
  OrganizationId,
} from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

export function FlightPriceDialog({
  offer,
  checkoutToken,
  organizationId,
  refresh,
}: {
  offer: FlightOffer;
  checkoutToken: string;
  organizationId: OrganizationId | null;
  refresh: () => void;
}) {
  const { t, number } = useLanguage();
  const confirmPrice = useServerFn(confirmFlightPriceServer);
  const [result, setResult] = useState<FlightPriceConfirmation | null>(null);
  const request = useRef(0);

  async function onOpenChange(open: boolean) {
    const current = ++request.current;
    if (!open) return;
    setResult(null);
    try {
      const response = await confirmPrice({
        data: { checkoutToken, ...(organizationId ? { organizationId } : {}) },
      });
      if (request.current === current) setResult(response);
    } catch {
      if (request.current === current) setResult({ status: "error" });
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("Select flight")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {offer.origin} → {offer.destination}
          </DialogTitle>
          <DialogDescription>{t("Test price check · Travelport pre-production")}</DialogDescription>
        </DialogHeader>
        <p>
          {offer.carrier} · {offer.flightNumber}
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <dt>{t("Search price")}</dt>
          <dd>
            {number(offer.price.amount)} {offer.price.currency}
          </dd>
          {result && "price" in result && (
            <>
              <dt>{t("Confirmed price")}</dt>
              <dd>
                {number(result.price.amount)} {result.price.currency}
              </dd>
            </>
          )}
        </dl>
        <div role="status" className="text-sm">
          {!result && t("Confirming the price…")}
          {result?.status === "changed" && t("The price changed since the search.")}
          {result?.status === "unavailable" && t("This fare is no longer available.")}
          {result?.status === "expired" && t("This offer has expired. Refresh your search.")}
          {result?.status === "error" && t("Unable to confirm this price. Try again.")}
        </div>
        {result?.status === "confirmed" && <CheckoutFareRules rules={result.fareRules} />}
        {result?.status === "confirmed" && result.bookingToken && (
          <TestBookingForm
            bookingToken={result.bookingToken}
            bookingClass={result.bookingClass}
            organizationId={organizationId}
          />
        )}
        {result?.status === "expired" && (
          <Button type="button" onClick={refresh}>
            {t("Refresh search")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestBookingForm({
  bookingToken,
  bookingClass,
  organizationId,
}: {
  bookingToken: string;
  bookingClass: string | undefined;
  organizationId: OrganizationId | null;
}) {
  const { t } = useLanguage();
  const createBooking = useServerFn(createFlightTestBookingServer);
  const submitted = useRef(false);
  const [result, setResult] = useState<FlightTestBooking | "pending" | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    submitted.current = true;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const passenger = {
      given: String(fields.get("given")),
      surname: String(fields.get("surname")),
    };
    form.reset();
    setResult("pending");
    try {
      setResult(
        await createBooking({
          data: { bookingToken, passenger, ...(organizationId ? { organizationId } : {}) },
        }),
      );
    } catch {
      setResult({ status: "unknown" });
    }
  }

  return (
    <section className="space-y-3 border-t pt-4">
      <p className="font-medium">{t("Test booking · no payment")}</p>
      <p className="text-sm">
        {t("Confirmed booking class")} {bookingClass}
      </p>
      {result === null ? (
        <form className="space-y-3" autoComplete="off" onSubmit={submit}>
          <p className="text-sm">{t("Use fictional passenger details.")}</p>
          <label className="block space-y-1 text-sm">
            <span>{t("Test given name")}</span>
            <Input name="given" required maxLength={32} pattern="[A-Za-z]+(?:[ \-][A-Za-z]+)*" />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("Test surname")}</span>
            <Input name="surname" required maxLength={32} pattern="[A-Za-z]+(?:[ \-][A-Za-z]+)*" />
          </label>
          <Button type="submit">{t("Create test booking")}</Button>
        </form>
      ) : (
        <p role="status" className="text-sm">
          {result === "pending" && t("Creating the test booking…")}
          {result !== "pending" && result.status === "booked" && (
            <>
              PNR <strong>{result.pnr}</strong>
            </>
          )}
          {result !== "pending" &&
            result.status === "unknown" &&
            t("Booking status is unknown. Verify it in Travelport before trying again.")}
          {result !== "pending" &&
            result.status === "unavailable" &&
            t("Test booking is unavailable.")}
          {result !== "pending" &&
            result.status === "error" &&
            t("Unable to create a test booking.")}
        </p>
      )}
    </section>
  );
}
