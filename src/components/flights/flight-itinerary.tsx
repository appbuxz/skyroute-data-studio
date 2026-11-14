import { useLanguage } from "@/lib/i18n/language-context";
import type { FlightItinerary as Itinerary } from "@/lib/flights/types";
import { FlightDateTime } from "./flight-date-time";

export function FlightItinerary({ itinerary, label }: { itinerary: Itinerary; label: string }) {
  const { t, number } = useLanguage();
  const localizedLabel = t(label);
  function duration(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours
      ? `${t("{hours}h", { hours: number(hours) })}${remainder ? ` ${t("{minutes}m", { minutes: number(remainder) })}` : ""}`
      : t("{minutes}m", { minutes: number(remainder) });
  }
  return (
    <section aria-label={localizedLabel} className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">{localizedLabel}</h3>
      <p className="text-sm text-muted-foreground">
        {itinerary.durationMinutes === undefined
          ? t("Total journey duration unavailable")
          : t("Total journey duration: {duration}", {
              duration: duration(itinerary.durationMinutes),
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
                    duration: duration(segment.durationMinutes),
                  })}
                </p>
              )}
              {next && (
                <p className="rounded bg-muted px-2 py-1">
                  {segment.destination === next.origin
                    ? t("Connection at {airport}", { airport: segment.destination })
                    : t("Airport transfer: {from} → {to}", {
                        from: segment.destination,
                        to: next.origin,
                      })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
