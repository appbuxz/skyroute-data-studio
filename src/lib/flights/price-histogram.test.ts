import { describe, expect, it } from "vitest";
import { analyticsSnapshot51, connectingOffer } from "@/test/fixtures/agency-analysis";
import { buildPriceHistograms } from "./price-histogram";

function offers(prices: number[], currency = "KZT") {
  return prices.map((amount, i) => ({
    ...connectingOffer(String(i)),
    price: { amount, currency },
  }));
}

describe("price histogram", () => {
  it("counts all 51 offers in bounded, equal-width bins without changing prices", () => {
    const snapshot = analyticsSnapshot51();
    const original = structuredClone(snapshot.offers);
    const [distribution] = buildPriceHistograms(snapshot.offers);
    expect(distribution!.count).toBe(51);
    expect(distribution!.bins).toHaveLength(6);
    expect(distribution!.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(51);
    expect(distribution!.bins[0]!.lower).toBe(180000);
    expect(distribution!.bins.at(-1)!.upper).toBe(264000);
    expect(snapshot.offers).toEqual(original);
  });
  it("includes the maximum once and sends interior boundaries into the next bin", () => {
    const [distribution] = buildPriceHistograms(offers([0, 10, 20, 30, 40, 40, 0, 10, 20]));
    expect(distribution!.bins.map((bin) => bin.count)).toEqual([4, 2, 3]);
  });
  it("keeps currencies separate without conversion", () => {
    const distributions = buildPriceHistograms([
      ...offers([100, 200]),
      ...offers([1, 2, 3], "USD"),
    ]);
    expect(distributions.map(({ currency, count }) => [currency, count])).toEqual([
      ["KZT", 2],
      ["USD", 3],
    ]);
    expect(distributions[1]!.bins[0]!.lower).toBe(1);
    expect(distributions[1]!.bins.at(-1)!.upper).toBe(3);
  });
  it.each([0, 150.25])("handles identical prices %s in one bin", (amount) => {
    expect(buildPriceHistograms(offers([amount, amount, amount]))[0]!.bins).toEqual([
      { lower: amount, upper: amount, count: 3 },
    ]);
  });
  it("ignores invalid amounts and currency codes", () => {
    expect(buildPriceHistograms([...offers([NaN, Infinity, -1]), ...offers([100], "bad")])).toEqual(
      [],
    );
    expect(buildPriceHistograms([])).toEqual([]);
  });
});
