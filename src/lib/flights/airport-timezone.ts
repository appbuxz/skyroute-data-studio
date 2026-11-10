const AIRPORT_TIMEZONES: Record<string, string> = {
  // Kazakhstan
  ALA: "Asia/Almaty",
  NQZ: "Asia/Almaty",
  CIT: "Asia/Almaty",
  AKX: "Asia/Almaty",
  GUW: "Asia/Almaty",
  SCO: "Asia/Almaty",
  KGF: "Asia/Almaty",
  UKK: "Asia/Almaty",

  // Turkey
  IST: "Europe/Istanbul",

  // Azerbaijan
  GYD: "Asia/Baku",

  // China
  PKX: "Asia/Shanghai",

  // United States — Travelport test route
  JFK: "America/New_York",
  LAX: "America/Los_Angeles",
  // Verified locations and IANA rules: docs/airport-timezone-sources.md
  ONT: "America/Los_Angeles",
  PHX: "America/Phoenix",
  LGA: "America/New_York",
  DFW: "America/Chicago",
  BUR: "America/Los_Angeles",
  CLT: "America/New_York",
  EWR: "America/New_York",
  SNA: "America/Los_Angeles",
  ORD: "America/Chicago",
  BOS: "America/New_York",
};

export function getAirportTimeZone(iata: string): string {
  const code = iata.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Invalid IATA airport code: ${iata}`);
  }

  const timezone = AIRPORT_TIMEZONES[code];

  if (!timezone) {
    throw new Error(`Timezone not configured for airport: ${code}`);
  }

  return timezone;
}
