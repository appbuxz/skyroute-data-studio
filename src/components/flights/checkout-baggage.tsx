import type { CheckoutBaggage as Baggage, CheckoutBaggageAllowance } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";

export function CheckoutBaggage({ baggage }: { baggage: Baggage | undefined }) {
  const { t, number } = useLanguage();

  function describe(allowance: CheckoutBaggageAllowance | undefined) {
    if (!allowance) return t("No data");
    if (allowance.status === "not_included") return t("Not included");
    const details: string[] = [];
    if (allowance.pieces !== undefined) {
      details.push(t("{count} pc", { count: number(allowance.pieces) }));
    }
    if (allowance.weight) {
      const { value, unit } = allowance.weight;
      details.push(t(unit === "kg" ? "{weight} kg" : "{weight} lb", { weight: number(value) }));
    }
    return details.length ? details.join(" · ") : t("Included");
  }

  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="font-medium">{t("Baggage allowances")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt>{t("Checked baggage")}</dt>
        <dd>{describe(baggage?.checked)}</dd>
        <dt>{t("Cabin baggage")}</dt>
        <dd>{describe(baggage?.cabin)}</dd>
      </dl>
    </section>
  );
}
