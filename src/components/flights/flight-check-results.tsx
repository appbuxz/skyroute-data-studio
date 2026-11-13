import { Card, CardContent } from "@/components/ui/card";
import type { FlightCheckResult, OfferRequirementEvaluation } from "@/lib/flights/flight-check";
import type { FlightOffer } from "@/lib/flights/types";
import { FlightItinerary } from "./flight-itinerary";
import { FlightDateTime } from "./flight-date-time";

const outcomes: Record<FlightCheckResult["status"], string> = {
  better_offer_found: "Cheaper alternatives meet your requirements",
  no_better_offer_found: "No cheaper qualifying alternative found",
  insufficient_data: "We couldn’t verify a suitable alternative",
  no_offers_found: "No alternatives returned",
  search_failed: "Flight check unavailable",
};
const requirementNames = {
  checked: "Checked baggage",
  cabin: "Cabin baggage",
  compatibility: "Flight compatibility",
  pricing: "Total price",
};

function money(amount: number, currency: string) {
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return "Price unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(amount);
}

export function FlightCheckResults({ result }: { result: FlightCheckResult }) {
  const evaluations = result.requirementEvaluations ?? [];
  const qualifying = evaluations.filter((e) => e.status === "requirements_met");
  const conditional = evaluations.filter((e) => e.status === "requirements_unknown");
  const incompatible = evaluations.filter((e) => e.status === "requirements_not_met");
  const environment =
    result.environment === "test"
      ? "Travelport Preproduction · Test environment"
      : result.environment === "production"
        ? "Production environment"
        : "Provider environment unknown";
  return (
    <section aria-label="Flight check results" className="space-y-5">
      <Card className="border-highlight/40">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Your original total · user-provided</p>
              <p className="mt-1 text-2xl font-semibold">
                {money(result.originalPrice.amount, result.originalPrice.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                Unverified total for all passengers · {result.originalPrice.currency}
              </p>
            </div>
            <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
              {environment}
            </p>
          </div>
          <h2 className="text-xl font-semibold" role="status">
            {outcomes[result.status]}
          </h2>
          {result.status === "search_failed" ? (
            <p className="text-sm">
              The search could not be completed. Check your details and try again. No price
              comparison is available.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {result.offersChecked} alternatives checked · {result.comparableOfferCount} meet your
              requirements. Comparison covers returned results only.
            </p>
          )}
          {result.status === "no_offers_found" && (
            <p className="text-sm">
              No flights were returned for this route and date. You can change your search details.
            </p>
          )}
          {result.status === "insufficient_data" && (
            <p className="text-sm">
              Returned alternatives have unknown evidence or unmet requirements. None can be
              recommended as fully qualifying.
            </p>
          )}
          {result.status === "no_better_offer_found" && (
            <p className="text-sm">
              No qualifying returned alternative costs less than your original total. This does not
              cover the entire market.
            </p>
          )}
          {result.status === "better_offer_found" &&
            result.savingsAmount !== undefined &&
            result.bestComparableOffer && (
              <div className="rounded-lg bg-accent p-4 text-accent-foreground">
                <p className="text-sm font-medium">Best potential savings</p>
                <p className="text-2xl font-bold">
                  {money(result.savingsAmount, result.originalPrice.currency)}
                </p>
                <p className="text-sm">
                  Alternative total:{" "}
                  {money(
                    result.bestComparableOffer.price.amount,
                    result.bestComparableOffer.price.currency,
                  )}
                </p>
              </div>
            )}
          <p className="text-sm text-muted-foreground">
            {result.environment === "test"
              ? "Preproduction test results are not verified as live bookable fares. "
              : result.environment === "unknown"
                ? "The provider environment is unverified. Do not treat these results as live bookable fares. "
                : ""}
            Availability, bookability and equivalence of all fare conditions are not verified.
            Potential savings apply only to alternatives meeting the selected requirements.
          </p>
        </CardContent>
      </Card>
      {qualifying.length > 0 && (
        <section aria-label="Qualifying alternatives" className="space-y-3">
          <h2 className="text-lg font-semibold">Meet your requirements ({qualifying.length})</h2>
          {[...qualifying]
            .sort((a, b) => a.offer.price.amount - b.offer.price.amount)
            .map((evaluation, index) => (
              <OfferCard
                key={evaluation.offer.id}
                evaluation={evaluation}
                index={index}
                category="qualifying"
                result={result}
              />
            ))}
        </section>
      )}
      {conditional.length > 0 && (
        <section aria-label="Conditional alternatives" className="space-y-3">
          <h2 className="text-lg font-semibold">Need more verification ({conditional.length})</h2>
          <p className="text-sm text-muted-foreground">
            These alternatives do not fully qualify. Any price difference is informational and is
            not qualifying savings.
          </p>
          {conditional.map((evaluation, index) => (
            <OfferCard
              key={evaluation.offer.id}
              evaluation={evaluation}
              index={index}
              category="conditional"
              result={result}
            />
          ))}
        </section>
      )}
      {incompatible.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            Do not meet your requirements ({incompatible.length})
          </summary>
          <p className="my-3 text-sm text-muted-foreground">
            These alternatives are unsuitable for the selected requirements and are not recommended.
          </p>
          <div className="space-y-3">
            {incompatible.map((evaluation, index) => (
              <OfferCard
                key={evaluation.offer.id}
                evaluation={evaluation}
                index={index}
                category="incompatible"
                result={result}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function OfferCard({
  evaluation,
  index,
  category,
  result,
}: {
  evaluation: OfferRequirementEvaluation;
  index: number;
  category: "qualifying" | "conditional" | "incompatible";
  result: FlightCheckResult;
}) {
  const { offer } = evaluation;
  const cheaper =
    category === "qualifying" &&
    offer.price.currency === result.originalPrice.currency &&
    offer.price.amount < result.originalPrice.amount;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {offer.origin} → {offer.destination}
            </p>
            <p className="text-sm text-muted-foreground">
              Airline: {offer.carrier} · Flight {offer.flightNumber}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-bold">{money(offer.price.amount, offer.price.currency)}</p>
            <p className="text-xs text-muted-foreground">Alternative total for all passengers</p>
          </div>
        </div>
        <p className="text-sm">
          {offer.stops === 0 ? "Nonstop" : `${offer.stops} stop${offer.stops === 1 ? "" : "s"}`}
        </p>
        {category === "qualifying" && (
          <p className="text-sm font-medium text-accent-foreground">
            {cheaper
              ? `Potential savings: ${money(result.originalPrice.amount - offer.price.amount, result.originalPrice.currency)}`
              : "Requirements met · no lower price"}
          </p>
        )}
        {category === "conditional" && evaluation.priceDifference !== undefined && (
          <p className="text-sm">
            Informational price difference (original minus alternative):{" "}
            {money(evaluation.priceDifference, result.originalPrice.currency)}. Requirements remain
            unverified.
          </p>
        )}
        <div className="rounded-md bg-muted p-3">
          <p className="mb-2 text-sm font-medium">
            {category === "qualifying"
              ? "Verified traveler requirements"
              : category === "conditional"
                ? "Requirements needing verification"
                : "Unmet requirements"}
          </p>
          <ul className="space-y-1 text-sm">
            {evaluation.reasons
              .filter((reason) => category === "qualifying" || reason.status !== "requirements_met")
              .map((reason, i) => (
                <li key={i}>
                  {requirementNames[reason.requirement]}: {reason.reason}
                  {reason.status === "requirements_unknown"
                    ? " (unknown)"
                    : reason.status === "requirements_not_met"
                      ? " (not met)"
                      : ""}
                </li>
              ))}
          </ul>
        </div>
        <Itinerary offer={offer} label={`${category} alternative ${index + 1} itinerary`} />
      </CardContent>
    </Card>
  );
}

function Itinerary({ offer, label }: { offer: FlightOffer; label: string }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Times are local to each airport; UTC offsets are shown.
      </p>
      {offer.outbound?.segments.length ? (
        <FlightItinerary itinerary={offer.outbound} label={label} />
      ) : (
        <div className="text-sm">
          <p>
            Departure: <FlightDateTime value={offer.departureAt} />
          </p>
          <p>
            Arrival: <FlightDateTime value={offer.arrivalAt} />
          </p>
          <p>Complete segment details unavailable</p>
        </div>
      )}
      {offer.inbound?.segments.length ? (
        <FlightItinerary itinerary={offer.inbound} label={`${label} return`} />
      ) : null}
    </div>
  );
}
