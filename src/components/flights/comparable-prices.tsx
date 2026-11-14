import { useLanguage } from "@/lib/i18n/language-context";
import { CABIN_LABELS } from "@/lib/flights/types";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { FlightSearchSnapshot } from "@/lib/flights/types";
import { analyzeComparablePrices } from "@/lib/flights/comparable-prices";
import { FlightDateTime } from "./flight-date-time";

export function ComparablePrices({
  search,
  collapsible = false,
}: {
  search: FlightSearchSnapshot;
  collapsible?: boolean;
}) {
  const { t, number, groupsLabel } = useLanguage();
  // Current search contract sends every passenger as ADT to Travelport.
  const passengers = { adults: search.params.passengers, children: 0, infants: 0 };
  const groups = analyzeComparablePrices(search.offers.map((offer) => ({ offer, passengers })));
  const content = (
    <>
      <p className="text-sm text-muted-foreground">
        {t(
          "Fare conditions not fully verified. Differences are based on this search snapshot, not guaranteed savings or a booking quote.",
        )}
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("No comparable offer groups found.")}</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group, index) => {
            const offer = group.offers[0]!;
            return (
              <li key={index} className="space-y-1 text-sm">
                <p className="font-medium">
                  {offer
                    .outbound!.segments.map(
                      (s) => `${s.origin} → ${s.destination} (${s.carrier} ${s.flightNumber})`,
                    )
                    .join(" · ")}
                </p>
                <p>
                  <FlightDateTime value={offer.departureAt} /> ·{" "}
                  {t("{count} adult(s)", { count: number(passengers.adults) })} ·{" "}
                  {t(CABIN_LABELS[offer.cabinClass])} ·{" "}
                  {t("{count} offers", { count: number(group.offers.length) })}
                </p>
                <p>
                  {t("Minimum:")} {number(group.minimumPrice)} {group.currency} · {t("Maximum:")}{" "}
                  {number(group.maximumPrice)} {group.currency}
                </p>
                <p>
                  {t("Potential price difference")}: {number(group.potentialPriceDifference)}{" "}
                  {group.currency}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
  return (
    <section aria-label={t("Comparable offer prices")} className="space-y-3 rounded-lg border p-4">
      {collapsible ? (
        <Collapsible>
          <h2>
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold">{t("Potential price difference")}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {groupsLabel(groups.length)}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="space-y-3 pt-3">{content}</CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          <h2 className="font-semibold">{t("Potential price difference")}</h2>
          {content}
        </>
      )}
    </section>
  );
}
