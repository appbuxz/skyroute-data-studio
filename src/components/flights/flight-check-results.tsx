import { WorkspaceSection } from "@/components/common/workspace-section";
import { useLanguage } from "@/lib/i18n/language-context";
import { Card, CardContent } from "@/components/ui/card";
import type {
  FlightCheckInput,
  FlightCheckResult,
  OfferRequirementEvaluation,
} from "@/lib/flights/flight-check";
import { CABIN_LABELS, type FlightOffer } from "@/lib/flights/types";
import { FlightItinerary, OfferConnections, formatFlightDuration } from "./flight-itinerary";
import { FlightDateTime } from "./flight-date-time";
import { formatOfferBaggage } from "./flight-shortlist";

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

function formatMoney(amount: number, currency: string, locale: string, unavailable: string) {
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return unavailable;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
  })
    .format(amount)
    .replace(/\s/g, " ");
}

export function FlightCheckResults({
  result,
  input,
}: {
  result: FlightCheckResult;
  input: FlightCheckInput;
}) {
  const { t, number, date, locale } = useLanguage();
  const money = (amount: number, currency: string) =>
    formatMoney(amount, currency, locale, t("Price unavailable"));
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
  const best = result.bestComparableOffer;
  const savings = result.status === "better_offer_found" ? result.savingsAmount : undefined;
  return (
    <section aria-label={t("Flight check results")} className="space-y-3">
      <Card className="workspace-card">
        <CardContent className="check-result-summary workspace-card-content space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t(environment)}</p>
          <h2 className="text-lg font-semibold leading-tight" aria-live="polite">
            {t(outcomes[result.status])}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0 rounded-md border p-3">
              <h3 className="text-sm font-semibold">{t("Your original total · user-provided")}</h3>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {money(result.originalPrice.amount, result.originalPrice.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {input.origin} → {input.destination} · {date(new Date(input.departureDate), "UTC")}
              </p>
            </div>
            {best && (
              <div className="min-w-0 rounded-md border bg-accent p-3 text-accent-foreground">
                <h3 className="text-sm font-semibold">{t("Best matching alternative")}</h3>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {money(best.price.amount, best.price.currency)}
                </p>
                <p className="mt-1 text-xs">
                  {best.carrier} · {best.flightNumber}
                </p>
              </div>
            )}
          </div>
          {best && (
            <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-accent p-3 text-sm font-medium text-accent-foreground">
              {t(
                savings !== undefined
                  ? "Best potential savings"
                  : "Price difference (alternative minus original)",
              )}
              <strong className="text-lg tabular-nums">
                {money(
                  savings ?? best.price.amount - result.originalPrice.amount,
                  result.originalPrice.currency,
                )}
              </strong>
            </p>
          )}
          <details className="space-y-1 border-t pt-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              {t("Comparison criteria")}
            </summary>
            <p className="text-muted-foreground">
              {t("One-way")} · {t(CABIN_LABELS[input.cabinClass])} · {t("Passengers (adults)")}:{" "}
              {number(input.passengers)} · {result.originalPrice.currency}
            </p>
            {input.mode === "requirements_match" && (
              <dl className="grid gap-1 text-muted-foreground">
                {(["checked", "cabin"] as const).map((kind) => {
                  const requirement = input.baggageRequirements[kind];
                  return (
                    <div key={kind} className="flex flex-wrap gap-x-2">
                      <dt>{t(requirementNames[kind])}</dt>
                      <dd>
                        {requirement.status === "not_required"
                          ? t("Not required")
                          : t("Minimum: {allowance}", {
                              allowance: [
                                t("{count} pc", { count: number(requirement.pieces) }),
                                requirement.weightKg === undefined
                                  ? undefined
                                  : t("{weight} kg", { weight: number(requirement.weightKg) }),
                              ]
                                .filter(Boolean)
                                .join(" · "),
                            })}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </details>
          {result.status === "search_failed" ? (
            <p className="text-sm">
              {t(
                "The search could not be completed. Check your details and try again. No price comparison is available.",
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                "Checked: {checked} · Match: {matching}. Comparison covers returned results only.",
                {
                  checked: number(result.offersChecked),
                  matching: number(result.comparableOfferCount),
                },
              )}
            </p>
          )}
          {result.status === "no_offers_found" && (
            <p className="text-sm">
              {t(
                "No flights were returned for this route and date. You can change your search details.",
              )}
            </p>
          )}
          {result.status === "insufficient_data" && (
            <p className="text-sm">
              {t(
                "Returned alternatives have unknown evidence or unmet requirements. None can be recommended as fully qualifying.",
              )}
            </p>
          )}
          {result.status === "no_better_offer_found" && (
            <p className="text-sm">
              {t(
                "No qualifying returned alternative costs less than your original total. This does not cover the entire market.",
              )}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {result.environment === "test"
              ? t("Preproduction test results are not verified as live bookable fares.")
              : result.environment === "unknown"
                ? t(
                    "The provider environment is unverified. Do not treat these results as live bookable fares.",
                  )
                : null}{" "}
            {t(
              "Availability, bookability and equivalence of all fare conditions are not verified.",
            )}
          </p>
        </CardContent>
      </Card>
      {qualifying.length > 0 && (
        <WorkspaceSection
          label="Qualifying alternatives"
          title={t("Meet your requirements ({count})", { count: number(qualifying.length) })}
        >
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
        </WorkspaceSection>
      )}
      {conditional.length > 0 && (
        <WorkspaceSection
          label="Conditional alternatives"
          title={t("Need more verification ({count})", { count: number(conditional.length) })}
        >
          <p className="text-sm text-muted-foreground">
            {t(
              "These alternatives do not fully qualify. Any price difference is informational and is not qualifying savings.",
            )}
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
        </WorkspaceSection>
      )}
      {incompatible.length > 0 && (
        <WorkspaceSection
          title={t("Do not meet your requirements ({count})", {
            count: number(incompatible.length),
          })}
          defaultOpen={false}
          keepMounted
        >
          <p className="my-3 text-sm text-muted-foreground">
            {t(
              "These alternatives are unsuitable for the selected requirements and are not recommended.",
            )}
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
        </WorkspaceSection>
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
  const language = useLanguage();
  const { t, number, locale } = language;
  const money = (amount: number, currency: string) =>
    formatMoney(amount, currency, locale, t("Price unavailable"));
  const { offer } = evaluation;
  const cheaper =
    category === "qualifying" &&
    offer.price.currency === result.originalPrice.currency &&
    offer.price.amount < result.originalPrice.amount;
  return (
    <Card className="agency-offer">
      <CardContent className="agency-offer-body">
        <div className="flight-offer-overview">
          <div className="flight-offer-route">
            <h3 className="font-semibold">
              {offer.origin} → {offer.destination}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("Airline: {carrier} · Flight {flight}", {
                carrier: offer.carrier,
                flight: offer.flightNumber,
              })}
            </p>
          </div>
          <div className="flight-offer-schedule text-sm">
            <p className="font-medium tabular-nums">
              <FlightDateTime value={offer.departureAt} compact /> –{" "}
              <FlightDateTime value={offer.arrivalAt} compact />
            </p>
            <p className="text-muted-foreground">
              <span>
                {offer.stops === 0
                  ? t("Direct flight")
                  : offer.stops === 1
                    ? t("1 stop")
                    : t("{count} stops", { count: number(offer.stops) })}
              </span>
              {offer.outbound?.durationMinutes !== undefined &&
                ` · ${formatFlightDuration(offer.outbound.durationMinutes, language)}`}
            </p>
            {(["checked", "cabin"] as const).map((kind) => {
              const allowance = formatOfferBaggage(offer, kind, language);
              return allowance === t("No data") ? null : (
                <p key={kind} className="text-xs text-muted-foreground">
                  {t(requirementNames[kind])} · {allowance}
                </p>
              );
            })}
          </div>
          <div className="min-w-0 max-w-36 text-right">
            <p className="break-words text-lg font-bold tabular-nums">
              {money(offer.price.amount, offer.price.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                category === "qualifying" ||
                  evaluation.reasons.some(
                    (reason) =>
                      reason.requirement === "pricing" && reason.status === "requirements_met",
                  )
                  ? "Alternative total for all passengers"
                  : "Provider price · total unverified",
              )}
            </p>
          </div>
        </div>
        <OfferConnections offer={offer} className="space-y-1 text-xs text-muted-foreground" />
        {category === "qualifying" && (
          <p className="text-sm font-medium text-accent-foreground">
            {cheaper
              ? t("Potential savings: {price}", {
                  price: money(
                    result.originalPrice.amount - offer.price.amount,
                    result.originalPrice.currency,
                  ),
                })
              : t("Requirements met · no lower price")}
          </p>
        )}
        {category === "conditional" && evaluation.priceDifference !== undefined && (
          <p className="text-sm">
            {t(
              "Informational price difference (original minus alternative): {price}. Requirements remain unverified.",
              {
                price: money(evaluation.priceDifference, result.originalPrice.currency),
              },
            )}
          </p>
        )}
        <div className="rounded-md bg-muted p-3">
          <p className="mb-2 text-sm font-medium">
            {t(
              category === "qualifying"
                ? "Verified traveler requirements"
                : category === "conditional"
                  ? "Requirements needing verification"
                  : "Unmet requirements",
            )}
          </p>
          <ul className="space-y-1 text-sm">
            {evaluation.reasons
              .filter((reason) => category === "qualifying" || reason.status !== "requirements_met")
              .map((reason, i) => (
                <li key={i}>
                  {t(requirementNames[reason.requirement])}: {t(reason.reason)}
                  {reason.status === "requirements_unknown"
                    ? ` (${t("unknown")})`
                    : reason.status === "requirements_not_met"
                      ? ` (${t("not met")})`
                      : ""}
                </li>
              ))}
          </ul>
        </div>
        <details className="flight-offer-details border-t pt-2">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary">
            {t("Flight details")}
          </summary>
          <Itinerary
            offer={offer}
            label={t("Alternative {number} itinerary", { number: number(index + 1) })}
          />
        </details>
      </CardContent>
    </Card>
  );
}

function Itinerary({ offer, label }: { offer: FlightOffer; label: string }) {
  const { t } = useLanguage();
  return (
    <div className="mt-2 space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("Times are local to each airport; UTC offsets are shown.")}
      </p>
      {offer.outbound?.segments.length ? (
        <FlightItinerary
          itinerary={offer.outbound}
          label={offer.inbound ? `${label} · ${t("Outbound")}` : label}
        />
      ) : (
        <div className="text-sm">
          <p>
            {t("Departure:")} <FlightDateTime value={offer.departureAt} />
          </p>
          <p>
            {t("Arrival:")} <FlightDateTime value={offer.arrivalAt} />
          </p>
          <p>{t("Segment details unavailable")}</p>
        </div>
      )}
      {offer.inbound?.segments.length ? (
        <FlightItinerary itinerary={offer.inbound} label="Return itinerary" />
      ) : null}
    </div>
  );
}
