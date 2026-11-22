import { useId } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { FlightOffer } from "@/lib/flights/types";
import { buildPriceHistograms } from "@/lib/flights/price-histogram";

export function PriceHistogram({ offers }: { offers: FlightOffer[] }) {
  const { t, number } = useLanguage();
  const id = useId();
  const compact = (value: number) =>
    number(value, { notation: "compact", maximumFractionDigits: 1 });
  const distributions = buildPriceHistograms(offers);
  if (!distributions.length)
    return <p className="text-sm text-muted-foreground">{t("No valid prices available.")}</p>;
  return distributions.map(({ currency, bins, count }) => {
    const maximum = Math.max(...bins.map((bin) => bin.count));
    const step = 420 / bins.length;
    const ticks = [...new Set([0, Math.ceil(maximum / 2), maximum])];
    return (
      <figure key={currency} className="min-w-0">
        <figcaption className="mb-1 flex justify-between text-xs">
          <span className="font-medium">{currency}</span>
          <span className="text-muted-foreground">
            {t("{count} offers", { count: number(count) })}
          </span>
        </figcaption>
        <svg
          viewBox="0 0 480 190"
          role="img"
          aria-labelledby={`${id}-${currency}`}
          className="w-full text-muted-foreground [&_text]:text-[16px] sm:[&_text]:text-[10px]"
        >
          <title id={`${id}-${currency}`}>
            {t(
              "Price distribution in {currency}: {count} offers. Horizontal axis: price ranges. Vertical axis: offer count.",
              { currency, count: number(count) },
            )}
          </title>
          <text x="4" y="12" fill="currentColor" fontSize="10">
            {t("Offers")}
          </text>
          {ticks.map((tick) => {
            const y = 130 - (tick / maximum) * 104;
            return (
              <g key={tick}>
                <line x1="38" x2="466" y1={y} y2={y} stroke="var(--border)" />
                <text x="29" y={y + 3} textAnchor="end" fill="currentColor" fontSize="10">
                  {number(tick)}
                </text>
              </g>
            );
          })}
          {bins.map((bin, i) => {
            const height = (bin.count / maximum) * 104;
            const x = 42 + i * step;
            const range =
              bin.lower === bin.upper
                ? number(bin.lower)
                : `${number(bin.lower)}–${number(bin.upper)}`;
            return (
              <g key={i}>
                <title>
                  {t(
                    i === bins.length - 1
                      ? "{range} {currency}: {count} offers (upper bound included)"
                      : "{range} {currency}: {count} offers (upper bound excluded)",
                    {
                      range,
                      currency,
                      count: number(bin.count),
                    },
                  )}
                </title>
                <rect
                  x={x}
                  y={130 - height}
                  width={step - 8}
                  height={height}
                  rx="3"
                  fill="var(--primary)"
                />
                {bin.count > 0 && (
                  <text
                    x={x + (step - 8) / 2}
                    y={125 - height}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize="10"
                  >
                    {number(bin.count)}
                  </text>
                )}
                <text
                  x={x + (step - 8) / 2}
                  y="147"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="10"
                >
                  {compact(bin.lower)}
                  {bin.lower !== bin.upper && (
                    <tspan x={x + (step - 8) / 2} dy="16">
                      –{compact(bin.upper)}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
          <text x="252" y="183" textAnchor="middle" fill="currentColor" fontSize="10">
            {t("Price range · {currency}", { currency })}
          </text>
        </svg>
      </figure>
    );
  });
}
