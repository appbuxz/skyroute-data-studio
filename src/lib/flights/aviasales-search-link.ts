import { flightSearchSchema, todayInKazakhstan } from "./search-schema";
import type { CabinClass, FlightSearchParams } from "./types";

const cabinCodes: Record<CabinClass, string> = {
  economy: "",
  premium_economy: "w",
  business: "c",
  first: "f",
};

export function aviasalesSearchLink(params: FlightSearchParams): string | undefined {
  const parsed = flightSearchSchema.safeParse(params);
  if (!parsed.success) return;

  const { origin, destination, departureDate, returnDate, cabinClass, passengers } = parsed.data;
  const today = todayInKazakhstan();
  const year = today.slice(0, 4);
  // The format has no year and does not document how it resolves a rollover.
  if (departureDate <= today || departureDate.slice(0, 4) !== year) return;
  if (returnDate && returnDate.slice(0, 4) !== year) return;

  const dayMonth = (date: string) => date.slice(8, 10) + date.slice(5, 7);
  const segment = origin + dayMonth(departureDate) + destination;
  const returnSegment = returnDate ? dayMonth(returnDate) : "";
  const url = new URL("https://www.aviasales.kz/");
  url.searchParams.set("params", segment + returnSegment + cabinCodes[cabinClass] + passengers);
  return url.href;
}
