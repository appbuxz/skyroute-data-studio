import type { FlightOffer } from "./types";

export interface PriceBin {
  lower: number;
  upper: number;
  count: number;
}

/** Equal-width bins per original currency, without conversion or fare comparisons. */
export function buildPriceHistograms(offers: FlightOffer[]) {
  const currencies = new Map<string, number[]>();
  for (const { price } of offers) {
    if (!Number.isFinite(price.amount) || price.amount < 0 || !/^[A-Z]{3}$/.test(price.currency))
      continue;
    const amounts = currencies.get(price.currency) ?? [];
    amounts.push(price.amount);
    currencies.set(price.currency, amounts);
  }
  return [...currencies].map(([currency, amounts]) => {
    const minimum = Math.min(...amounts);
    const maximum = Math.max(...amounts);
    const binCount = minimum === maximum ? 1 : Math.min(6, Math.ceil(Math.sqrt(amounts.length)));
    const width = (maximum - minimum) / binCount;
    const bins: PriceBin[] = Array.from({ length: binCount }, (_, i) => ({
      lower: minimum + i * width,
      upper: i === binCount - 1 ? maximum : minimum + (i + 1) * width,
      count: 0,
    }));
    for (const amount of amounts) {
      const index =
        width === 0 ? 0 : Math.min(binCount - 1, Math.floor((amount - minimum) / width));
      bins[index]!.count++;
    }
    return { currency, bins, count: amounts.length };
  });
}
