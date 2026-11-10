import { getAirportTimeZone } from "./airport-timezone";
import { localDateTimeToIso } from "./local-datetime";

export function serpApiDateTimeToIso(value: string, airportIata: string): string {
  if (!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Invalid SerpApi datetime format");
  }

  const [date, time] = value.split(" ");
  if (!date || !time) {
    throw new Error("Invalid SerpApi datetime");
  }

  return localDateTimeToIso(date, `${time}:00`, getAirportTimeZone(airportIata));
}
