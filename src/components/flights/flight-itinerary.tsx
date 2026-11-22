import { useLanguage } from "@/lib/i18n/language-context";
import type { FlightItinerary as Itinerary, FlightOffer, FlightSegment } from "@/lib/flights/types";
import { connectionDuration } from "@/lib/flights/connection-duration";
import { FlightDateTime } from "./flight-date-time";

export function formatFlightDuration(minutes: number, { t, number }: ReturnType<typeof useLanguage>) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours
    ? `${t("{hours}h", { hours: number(hours) })}${remainder ? ` ${t("{minutes}m", { minutes: number(remainder) })}` : ""}`
    : t("{minutes}m", { minutes: number(remainder) });
}

export function FlightConnection({
  segment,
  next,
}: {
  segment: FlightSegment;
  next: FlightSegment;
}) {
  const language = useLanguage();
  const { t } = language;
  const from = segment.destination;
  const to = next.origin;
  const transfer = from && to && from !== to;
  const label = transfer
    ? t("Airport transfer: {from} → {to}", { from, to })
    : from || to
      ? t("Connection at {airport}", { airport: from || to })
      : t("Connection");
  const minutes = connectionDuration(segment.arrivalAt, next.departureAt);
  if (minutes === undefined) return label;
  const duration = formatFlightDuration(minutes, language);
  return `${label} · ${transfer ? t("{duration} between flights", { duration }) : duration}`;
}

export function OfferConnections({
  offer,
  className,
}: {
  offer: FlightOffer;
  className?: string;
}) {
  const { t } = useLanguage();
  const directions = [
    { label: "Outbound", segments: offer.outbound?.segments },
    { label: "Return", segments: offer.inbound?.segments },
  ];
  if (!directions.some(({ segments }) => segments && segments.length > 1)) return null;
  return (
    <div className={className}>
      {directions.map(({ label, segments }) => segments && segments.length > 1 && (
        <div key={label} className="break-inside-avoid">
          {offer.inbound && <p className="font-medium">{t(label)}</p>}
          <ul className="space-y-0.5">
            {segments.slice(1).map((next, index) => (
              <li key={index}>
                <FlightConnection segment={segments[index]!} next={next} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function FlightItinerary({ itinerary, label }: { itinerary: Itinerary; label: string }) {
  const language = useLanguage();
  const { t, number } = language;
  const localizedLabel = t(label);
  return (
    <section aria-label={localizedLabel} className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">{localizedLabel}</h3>
      <p className="text-sm text-muted-foreground">
        {itinerary.durationMinutes === undefined
          ? t("Total journey duration unavailable")
          : t("Total journey duration: {duration}", {
              duration: formatFlightDuration(itinerary.durationMinutes, language),
            })}
      </p>
      <ol aria-label={t("{label} segments", { label: localizedLabel })} className="space-y-3">
        {itinerary.segments.map((segment, index) => {
          const next = itinerary.segments[index + 1];
          return (
            <li key={index} className="space-y-1 text-sm">
              <p className="font-medium">
                {number(index + 1)}. {segment.origin} → {segment.destination}
              </p>
              <p>
                {segment.carrier} · {segment.flightNumber}
              </p>
              <p className="text-muted-foreground">
                {t("Departure:")} <FlightDateTime value={segment.departureAt} />
              </p>
              <p className="text-muted-foreground">
                {t("Arrival:")} <FlightDateTime value={segment.arrivalAt} />
              </p>
              {segment.durationMinutes !== undefined && (
                <p className="text-muted-foreground">
                  {t("Flight duration: {duration}", {
                    duration: formatFlightDuration(segment.durationMinutes, language),
                  })}
                </p>
              )}
              {next && (
                <p className="rounded bg-muted px-2 py-1">
                  <FlightConnection segment={segment} next={next} />
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
