import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ComparablePrices } from "./comparable-prices";
import { normalizeTravelportFlights } from "@/lib/flights/travelport-normalizer";
import fixture from "@/lib/flights/fixtures/travelport-core.json";
import type { WorkspaceSearch } from "@/lib/organizations/workspace-context";
import type { OrganizationId } from "@/lib/flights/types";

afterEach(cleanup);
const base = normalizeTravelportFlights(fixture).offers[0]!;
const search: WorkspaceSearch = {
  organizationId: "test" as OrganizationId,
  params: {
    origin: base.origin,
    destination: base.destination,
    departureDate: "2026-12-03",
    passengers: 1,
    cabinClass: "economy",
  },
  fetchedAt: "2026-12-01T00:00:00Z",
  offers: [
    { ...base, id: "a", price: { amount: 100, currency: "USD" } },
    { ...base, id: "b", price: { amount: 250, currency: "USD" } },
  ],
};

it("labels missing fare conditions and presents potential differences without savings promises", () => {
  render(<ComparablePrices search={search} />);
  expect(screen.getByRole("heading", { name: "Potential price difference" })).toBeInTheDocument();
  expect(screen.getByText(/Fare conditions not fully verified/)).toBeInTheDocument();
  expect(screen.getByText("Potential price difference: 150 USD")).toBeInTheDocument();
  expect(screen.getByText("Minimum: 100 USD · Maximum: 250 USD")).toBeInTheDocument();
  expect(screen.queryByText("Guaranteed savings")).not.toBeInTheDocument();
});

it("reports no eligible comparison rather than comparing a single offer", () => {
  render(<ComparablePrices search={{ ...search, offers: search.offers.slice(0, 1) }} />);
  expect(screen.getByText("No comparable offer groups found.")).toBeInTheDocument();
});
