import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aviasalesSearchLink } from "./aviasales-search-link";
import type { FlightSearchParams } from "./types";

const params: FlightSearchParams = {
  origin: "ALA",
  destination: "IST",
  departureDate: "2026-12-12",
  cabinClass: "economy",
  passengers: 2,
};

beforeEach(() => vi.setSystemTime(new Date("2026-11-18T08:00:00Z")));
afterEach(() => vi.useRealTimers());

it("links to the Kazakhstan search form for a one-way trip", () => {
  expect(aviasalesSearchLink(params)).toBe("https://www.aviasales.kz/?params=ALA1212IST2");
});

it.each([
  ["economy", ""],
  ["premium_economy", "w"],
  ["business", "c"],
  ["first", "f"],
] as const)("encodes a round trip in %s", (cabinClass, code) => {
  expect(aviasalesSearchLink({ ...params, returnDate: "2026-12-19", cabinClass })).toBe(
    `https://www.aviasales.kz/?params=ALA1212IST1912${code}2`,
  );
});

it.each([
  { departureDate: "2027-12-12" },
  { departureDate: "2026-11-18" },
  { departureDate: "2026-11-17" },
  { returnDate: "2027-01-03" },
  { returnDate: "2026-12-11" },
  { origin: "ALA&test" },
  { passengers: 10 },
])("omits the link when the query cannot be represented exactly (%j)", (change) => {
  expect(aviasalesSearchLink({ ...params, ...change })).toBeUndefined();
});
