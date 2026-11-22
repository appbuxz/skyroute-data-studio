import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FlightItinerary, OfferConnections } from "./flight-itinerary";
import type { FlightSegment } from "@/lib/flights/types";
import { connectingOffer } from "@/test/fixtures/agency-analysis";

afterEach(cleanup);
const first: FlightSegment = {
  carrier: "AA",
  flightNumber: "101",
  origin: "JFK",
  destination: "DFW",
  departureAt: "2026-12-03T08:00:00-05:00",
  arrivalAt: "2026-12-03T11:00:00-06:00",
  durationMinutes: 240,
};
const second: FlightSegment = {
  carrier: "BA",
  flightNumber: "202",
  origin: "DFW",
  destination: "LAX",
  departureAt: "2026-12-03T12:30:00-06:00",
  arrivalAt: "2026-12-03T14:00:00-08:00",
  durationMinutes: 210,
};

it("shows the direct flight with exact airports, carrier, flight number and offset-aware dates", () => {
  render(
    <FlightItinerary
      label="Outbound itinerary"
      itinerary={{ segments: [first], durationMinutes: 240 }}
    />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText("1. JFK → DFW")).toBeInTheDocument();
  expect(screen.getByText("AA · 101")).toBeInTheDocument();
  expect(screen.getByText("3 Dec 2026 · 08:00 (UTC-05:00)")).toHaveAttribute(
    "datetime",
    first.departureAt,
  );
  expect(screen.getByText("3 Dec 2026 · 11:00 (UTC-06:00)")).toHaveAttribute(
    "datetime",
    first.arrivalAt,
  );
  expect(screen.getByText("Total journey duration: 4h")).toBeInTheDocument();
  expect(screen.queryByText(/Connection at/)).not.toBeInTheDocument();
});

it("shows all connecting segments in normalized order and the supplied total including layover", () => {
  render(
    <FlightItinerary
      label="Outbound itinerary"
      itinerary={{ segments: [first, second], durationMinutes: 540 }}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]!).getByText("1. JFK → DFW")).toBeInTheDocument();
  expect(within(items[0]!).getByText("AA · 101")).toBeInTheDocument();
  expect(within(items[1]!).getByText("2. DFW → LAX")).toBeInTheDocument();
  expect(within(items[1]!).getByText("BA · 202")).toBeInTheDocument();
  expect(screen.getByText("Connection at DFW · 1h 30m")).toBeInTheDocument();
  expect(screen.getByText("Total journey duration: 9h")).toBeInTheDocument();
  for (const value of [first.departureAt, first.arrivalAt, second.departureAt, second.arrivalAt]) {
    expect(document.querySelector(`time[datetime="${value}"]`)).not.toBeNull();
  }
});

it("keeps overnight arrival dates and durations unchanged across offsets", () => {
  const overnight = {
    ...first,
    departureAt: "2026-12-11T23:15:00+05:30",
    arrivalAt: "2026-12-12T02:45:00+03:00",
    durationMinutes: 360,
  };
  render(
    <FlightItinerary
      label="Outbound itinerary"
      itinerary={{ segments: [overnight], durationMinutes: 360 }}
    />,
  );
  expect(screen.getByText("11 Dec 2026 · 23:15 (UTC+05:30)")).toHaveAttribute(
    "datetime",
    overnight.departureAt,
  );
  expect(screen.getByText("12 Dec 2026 · 02:45 (UTC+03:00)")).toHaveAttribute(
    "datetime",
    overnight.arrivalAt,
  );
  expect(screen.getByText("Total journey duration: 6h")).toBeInTheDocument();
  expect(screen.getByText("Flight duration: 6h")).toBeInTheDocument();
});

it("does not invent missing durations", () => {
  const { durationMinutes: _, ...segment } = first;
  render(<FlightItinerary label="Outbound itinerary" itinerary={{ segments: [segment] }} />);
  expect(screen.getByText("Total journey duration unavailable")).toBeInTheDocument();
  expect(screen.queryByText(/Flight duration:/)).not.toBeInTheDocument();
});

it("groups round-trip connections by direction and measures each gap across dates and offsets", () => {
  const overnight = { ...second, arrivalAt: "2026-12-03T23:45:00-08:00" };
  const third = {
    ...second, origin: "SNA", destination: "SFO", flightNumber: "303",
    departureAt: "2026-12-04T03:15:00-07:00",
  };
  const offer = connectingOffer();
  offer.outbound = { segments: [first, overnight, third] };
  offer.inbound = { segments: offer.outbound.segments.slice(1).map((segment) => ({ ...segment })) };
  offer.inbound.segments[1]!.departureAt = "2026-12-04T03:15:00";
  render(<OfferConnections offer={offer} />);
  const outbound = within(screen.getByText("Outbound").parentElement!);
  const inbound = within(screen.getByText("Return").parentElement!);
  expect(outbound.getByText("Connection at DFW · 1h 30m")).toBeInTheDocument();
  expect(outbound.getByText("Airport transfer: LAX → SNA · 2h 30m between flights")).toBeInTheDocument();
  expect(inbound.getByText("Airport transfer: LAX → SNA")).toBeInTheDocument();
});

it.each(["", "2026-02-30T12:30:00-06:00", "2026-12-03T10:30:00-06:00"])(
  "keeps the airport without a duration when the next departure is unusable (%s)",
  (departureAt) => {
    render(<FlightItinerary label="Outbound itinerary" itinerary={{
      segments: [first, { ...second, departureAt }],
    }} />);
    expect(screen.getByText("Connection at DFW")).toBeInTheDocument();
  },
);
