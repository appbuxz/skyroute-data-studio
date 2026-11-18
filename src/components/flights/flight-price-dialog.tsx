import { type FormEvent, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckoutBaggage } from "./checkout-baggage";
import { CheckoutFareRules } from "./checkout-fare-rules";
import { FlightDateTime } from "./flight-date-time";
import { FlightItinerary } from "./flight-itinerary";
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
  acceptFlightPriceServer,
  confirmFlightPriceServer,
  createFlightTestBookingServer,
} from "@/lib/flights/flight-price.functions";
import type {
  ChangedFlightPrice,
  FlightOffer,
  FlightPriceConfirmation,
  FlightTestBooking,
  OrganizationId,
} from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

type TestPassenger = { given: string; surname: string };

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
  const acceptPrice = useServerFn(acceptFlightPriceServer);
  const confirmPrice = useServerFn(confirmFlightPriceServer);
  const [result, setResult] = useState<FlightPriceConfirmation | null>(null);
  const request = useRef(0);
  const [passenger, setPassenger] = useState<TestPassenger | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function onOpenChange(open: boolean) {
    const current = ++request.current;
    if (!open) {
      setPassenger(null);
      return;
    }
    setResult(null);
    setAccepting(false);
    try {
      const response = await confirmPrice({
        data: { checkoutToken, ...(organizationId ? { organizationId } : {}) },
      });
      if (request.current === current) setResult(response);
    } catch {
      if (request.current === current) setResult({ status: "error" });
    }
  }

  async function acceptNewPrice() {
    if (accepting || result?.status !== "changed" || !result.acceptanceToken) return;
    const current = request.current;
    setAccepting(true);
    try {
      const accepted = await acceptPrice({
        data: {
          acceptanceToken: result.acceptanceToken,
          ...(organizationId ? { organizationId } : {}),
        },
      });
      if (request.current === current) {
        setResult(
          accepted.status === "confirmed"
            ? {
                ...accepted,
                ...(result.baggage && { baggage: result.baggage }),
                ...(result.fareRules && { fareRules: result.fareRules }),
              }
            : accepted,
        );
      }
    } catch {
      if (request.current === current) setResult({ status: "error" });
    } finally {
      if (request.current === current) setAccepting(false);
    }
  }

  const previousPrice = result?.status === "changed" ? result.previousPrice : undefined;
  const formRequest = request.current;

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
        {offer.outbound?.segments.length ? (
          <FlightItinerary itinerary={offer.outbound} label="Outbound itinerary" />
        ) : (
          <div className="space-y-1 text-sm">
            <p>
              {offer.carrier} · {offer.flightNumber}
            </p>
            <p>
              {t("Departure:")} <FlightDateTime value={offer.departureAt} />
            </p>
            <p>
              {t("Arrival:")} <FlightDateTime value={offer.arrivalAt} />
            </p>
            {offer.stops > 0 && <p>{t("Segment details unavailable")}</p>}
          </div>
        )}
        {offer.inbound?.segments.length ? (
          <FlightItinerary itinerary={offer.inbound} label="Return itinerary" />
        ) : null}
        <dl className="grid grid-cols-2 gap-2">
          <dt>{t(previousPrice ? "Previous price" : "Search price")}</dt>
          <dd>
            {number((previousPrice ?? offer.price).amount)}{" "}
            {(previousPrice ?? offer.price).currency}
          </dd>
          {result && "price" in result && (
            <>
              <dt>
                {t(
                  result.status === "changed" && result.acceptanceToken
                    ? "New price"
                    : "Confirmed price",
                )}
              </dt>
              <dd>
                {number(result.price.amount)} {result.price.currency}
              </dd>
            </>
          )}
        </dl>
        <div role="status" className="text-sm">
          {!result && t("Confirming the price…")}
          {result?.status === "changed" &&
            t(
              result.previousPrice
                ? "The price changed. Review the new price."
                : "The price changed since the search.",
            )}
          {result?.status === "unavailable" && t("This fare is no longer available.")}
          {result?.status === "expired" && t("This offer has expired. Refresh your search.")}
          {result?.status === "error" && t("Unable to confirm this price. Try again.")}
        </div>
        {result?.status === "changed" && result.acceptanceToken && (
          <Button type="button" disabled={accepting} onClick={() => void acceptNewPrice()}>
            {t("Accept new price")}
          </Button>
        )}
        {(result?.status === "confirmed" ||
          (result?.status === "changed" && result.acceptanceToken)) && (
          <>
            <CheckoutBaggage baggage={result.baggage} />
            <CheckoutFareRules rules={result.fareRules} />
          </>
        )}
        {result?.status === "confirmed" && result.bookingToken && (
          <TestBookingForm
            key={result.bookingToken}
            bookingToken={result.bookingToken}
            bookingClass={result.bookingClass}
            organizationId={organizationId}
            offer={offer}
            price={result.price}
            passenger={passenger}
            onPassengerReview={setPassenger}
            onPriceReview={(confirmation) => {
              if (request.current === formRequest) setResult(confirmation);
            }}
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
  offer,
  price,
  passenger,
  onPassengerReview,
  onPriceReview,
}: {
  bookingToken: string;
  bookingClass: string | undefined;
  organizationId: OrganizationId | null;
  offer: FlightOffer;
  price: FlightOffer["price"];
  passenger: TestPassenger | null;
  onPassengerReview: (passenger: TestPassenger) => void;
  onPriceReview: (confirmation: ChangedFlightPrice) => void;
}) {
  const { t, number } = useLanguage();
  const createBooking = useServerFn(createFlightTestBookingServer);
  const submitted = useRef(false);
  const [editing, setEditing] = useState(!passenger);
  const [result, setResult] = useState<
    Exclude<FlightTestBooking, { status: "price_review" }> | "pending" | null
  >(null);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onPassengerReview({
      given: String(fields.get("given")).trim(),
      surname: String(fields.get("surname")).trim(),
    });
    setEditing(false);
  }

  async function submit() {
    if (submitted.current || editing || !passenger) return;
    submitted.current = true;
    setResult("pending");
    try {
      const response = await createBooking({
        data: { bookingToken, passenger, ...(organizationId ? { organizationId } : {}) },
      });
      if (response.status === "price_review") {
        onPriceReview(response.confirmation);
      } else {
        setResult(response);
      }
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
        editing || !passenger ? (
          <form className="space-y-3" autoComplete="off" onSubmit={review}>
            <p className="text-sm">{t("Use fictional passenger details.")}</p>
            <label className="block space-y-1 text-sm">
              <span>{t("Test given name")}</span>
              <Input
                name="given"
                defaultValue={passenger?.given}
                required
                maxLength={32}
                pattern="[A-Za-z]+(?:[ \-][A-Za-z]+)*"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>{t("Test surname")}</span>
              <Input
                name="surname"
                defaultValue={passenger?.surname}
                required
                maxLength={32}
                pattern="[A-Za-z]+(?:[ \-][A-Za-z]+)*"
              />
            </label>
            <Button type="submit">{t("Review details")}</Button>
          </form>
        ) : (
          <div className="space-y-3">
            <h3 className="font-medium">{t("Review your details")}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>{t("Passenger")}</dt>
              <dd>
                {passenger.given} {passenger.surname}
              </dd>
              <dt>{t("Selected flight")}</dt>
              <dd>
                {offer.carrier} · {offer.flightNumber} · {offer.origin} → {offer.destination}
              </dd>
              <dt>{t("Departure:")}</dt>
              <dd>
                <FlightDateTime value={offer.departureAt} />
              </dd>
              <dt>{t("Confirmed price")}</dt>
              <dd>
                {number(price.amount)} {price.currency}
              </dd>
            </dl>
            <p className="text-sm">{t("No payment or ticket issuance")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                {t("Edit details")}
              </Button>
              <Button type="button" onClick={() => void submit()}>
                {t("Create test booking")}
              </Button>
            </div>
          </div>
        )
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
