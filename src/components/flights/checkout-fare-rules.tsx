import type { FareRule, FareRuleCategory } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

const categoryLabels = {
  BeforeDeparture: "Before departure",
  AfterDeparture: "After departure",
  Anytime: "Anytime",
  NoShow: "No-show",
  Minimum: "Minimum penalty",
  Maximum: "Maximum penalty",
  ExchangeRequired: "Exchange required",
  ExchangeNotRequired: "Exchange not required",
} as const satisfies Record<FareRuleCategory, string>;

const scopeLabels = {
  OneWay: "One-way",
  RoundTrip: "Round trip",
  PerTicket: "Per ticket",
  PerCoupon: "Per coupon",
  PerDirectionOfTravel: "Per direction",
} as const;

const unitLabels = {
  Minutes: "Time window before departure: {value} min",
  Hours: "Time window before departure: {value} hr",
  Days: "Time window before departure: {value} days",
  Months: "Time window before departure: {value} months",
} as const;

function displayRules(rules: FareRule[]): FareRule[] {
  if (!rules.length) return [{ categories: [], status: "unknown" }];
  const hasGeneralRule = rules.some(
    ({ categories, timeWindow }) =>
      !timeWindow &&
      !categories.some(
        (category) =>
          category === "BeforeDeparture" || category === "AfterDeparture" || category === "NoShow",
      ),
  );
  if (hasGeneralRule) return rules;
  const missing = (["BeforeDeparture", "AfterDeparture"] as const).filter(
    (category) => !rules.some((rule) => rule.categories.includes(category)),
  );
  return [
    ...rules,
    ...missing.map((category) => ({
      categories: [category],
      status: "unknown" as const,
    })),
  ];
}

export function CheckoutFareRules({
  rules,
}: {
  rules: { change: FareRule[]; refund: FareRule[] } | undefined;
}) {
  const { t, number } = useLanguage();
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="font-medium">{t("Exchange and refund")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {(["change", "refund"] as const).map((action) => (
          <div key={action} className="contents">
            <dt>{t(action === "change" ? "Exchange" : "Refund")}</dt>
            <dd>
              <ul className="space-y-1">
                {displayRules(rules?.[action] ?? []).map((rule, index) => {
                  const details = rule.categories.map((category) => t(categoryLabels[category]));
                  if (rule.appliesTo) details.push(t(scopeLabels[rule.appliesTo]));
                  if (rule.timeWindow) {
                    details.push(
                      t(unitLabels[rule.timeWindow.period], {
                        value: number(rule.timeWindow.value),
                      }),
                    );
                  }
                  if (rule.segments?.length) {
                    details.push(
                      t("Flight segments: {segments}", { segments: rule.segments.join(", ") }),
                    );
                  }
                  const cost =
                    rule.status === "penalty"
                      ? rule.penalties
                          .map((fee) =>
                            fee.kind === "percent"
                              ? `${number(fee.value)}%`
                              : `${number(fee.value)} ${fee.currency}`,
                          )
                          .join(" / ")
                      : null;
                  return (
                    <li key={index}>
                      {details.length > 0 && (
                        <span className="text-muted-foreground">{details.join(" · ")} · </span>
                      )}
                      {rule.status === "prohibited" && t("Prohibited")}
                      {rule.status === "free" && t("No penalty")}
                      {rule.status === "unknown" && t("No data")}
                      {cost && t("Penalty: {cost}", { cost })}
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
