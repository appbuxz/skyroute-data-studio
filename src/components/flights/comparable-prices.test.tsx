import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("starts the search disclosure closed with the comparison count and opens all existing content", () => {
  render(<ComparablePrices search={search} collapsible />);
  const toggle = screen.getByRole("button", {
    name: "Potential price difference 1 comparison group",
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveAttribute("type", "button");
  expect(screen.queryByText(/Fare conditions not fully verified/)).not.toBeInTheDocument();
  expect(screen.queryByText("Potential price difference: 150 USD")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/Fare conditions not fully verified/)).toBeVisible();
  expect(screen.getByText("Minimum: 100 USD · Maximum: 250 USD")).toBeVisible();
  expect(screen.getByText("Potential price difference: 150 USD")).toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Potential price difference: 150 USD")).not.toBeInTheDocument();
});

it("counts separate currencies as separate groups and retains their prices when expanded", () => {
  const multi = {
    ...search,
    offers: [
      ...search.offers,
      ...search.offers.map((offer, i) => ({
        ...offer,
        id: `kzt-${i}`,
        price: { amount: 10000 + i * 5000, currency: "KZT" },
      })),
    ],
  };
  render(<ComparablePrices search={multi} collapsible />);
  const toggle = screen.getByRole("button", {
    name: "Potential price difference 2 comparison groups",
  });
  fireEvent.click(toggle);
  expect(screen.getByText("Potential price difference: 150 USD")).toBeVisible();
  expect(
    screen.getByText(`Potential price difference: ${(5000).toLocaleString()} KZT`),
  ).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("keeps the zero-group state collapsed until requested", () => {
  render(
    <ComparablePrices search={{ ...search, offers: search.offers.slice(0, 1) }} collapsible />,
  );
  const toggle = screen.getByRole("button", {
    name: "Potential price difference 0 comparison groups",
  });
  expect(screen.queryByText("No comparable offer groups found.")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByText("No comparable offer groups found.")).toBeVisible();
});
