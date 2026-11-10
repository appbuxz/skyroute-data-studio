import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FlightDateTime } from "./flight-date-time";

afterEach(cleanup);

it.each([
  ["2026-12-11T11:15:00+05:00", "11 Dec 2026 · 11:15 (UTC+05:00)"],
  ["2026-12-11T00:15:00+05:45", "11 Dec 2026 · 00:15 (UTC+05:45)"],
  ["2026-12-11T23:15:00-08:00", "11 Dec 2026 · 23:15 (UTC-08:00)"],
  ["2026-12-12T02:15:00Z", "12 Dec 2026 · 02:15 (UTC+00:00)"],
  ["2027-01-01T01:00:00.000+14:00", "1 Jan 2027 · 01:00 (UTC+14:00)"],
])("preserves the API's local calendar date, time and offset for %s", (value, expected) => {
  render(<FlightDateTime value={value} />);
  expect(screen.getByText(expected)).toHaveAttribute("datetime", value);
});

it("does not guess a timezone for offset-free input", () => {
  render(<FlightDateTime value="2026-12-11T11:15:00" />);
  expect(screen.getByText("Date/time unavailable")).toBeInTheDocument();
});
