import type { FlightItinerary as Itinerary } from "@/lib/flights/types";
import { FlightDateTime } from "./flight-date-time";

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}

export function FlightItinerary({ itinerary, label }: { itinerary: Itinerary; label: string }) {
  return (
    <section aria-label={label} className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="text-sm text-muted-foreground">
        {itinerary.durationMinutes === undefined
          ? "Total journey duration unavailable"
          : `Total journey duration: ${duration(itinerary.durationMinutes)}`}
      </p>
      <ol aria-label={`${label} segments`} className="space-y-3">
        {itinerary.segments.map((segment, index) => {
          const next = itinerary.segments[index + 1];
          return (
            <li key={index} className="space-y-1 text-sm">
              <p className="font-medium">
                {index + 1}. {segment.origin} → {segment.destination}
              </p>
              <p>
                {segment.carrier} · {segment.flightNumber}
              </p>
              <p className="text-muted-foreground">
                Departure: <FlightDateTime value={segment.departureAt} />
              </p>
              <p className="text-muted-foreground">
                Arrival: <FlightDateTime value={segment.arrivalAt} />
              </p>
              {segment.durationMinutes !== undefined && (
                <p className="text-muted-foreground">
                  Flight duration: {duration(segment.durationMinutes)}
                </p>
              )}
              {next && (
                <p className="rounded bg-muted px-2 py-1">
                  {segment.destination === next.origin
                    ? `Connection at ${segment.destination}`
                    : `Airport transfer: ${segment.destination} → ${next.origin}`}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
