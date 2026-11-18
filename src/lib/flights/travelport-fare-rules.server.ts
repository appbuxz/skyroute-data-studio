import { z } from "zod";
import type { FareRule, FareRulePenalty } from "./types";

const refs = z.array(z.string()).optional();
const sequence = z.array(z.number().int().positive()).optional();
const category = z.enum([
  "BeforeDeparture",
  "AfterDeparture",
  "Anytime",
  "NoShow",
  "Minimum",
  "Maximum",
  "ExchangeRequired",
  "ExchangeNotRequired",
]);
const period = z.object({
  value: z.number().finite().nonnegative(),
  period: z.enum(["Minutes", "Hours", "Days", "Months"]),
});
const rule = z.object({
  "@type": z.string(),
  ProductRefs: refs,
  SegmentSequence: sequence,
  penaltyTypes: z.array(category).optional(),
  PeriodBeforeDeparture: period.optional(),
  PenaltyAppliesTo: z
    .enum(["OneWay", "RoundTrip", "PerTicket", "PerCoupon", "PerDirectionOfTravel"])
    .optional(),
  Penalty: z.array(z.unknown()).optional(),
});
const penalty = z.discriminatedUnion("@type", [
  z.object({
    "@type": z.literal("PenaltyAmount"),
    Amount: z.object({
      value: z.number().finite().nonnegative(),
      code: z.string().regex(/^[A-Z]{3}$/),
    }),
  }),
  z.object({
    "@type": z.literal("PenaltyPercent"),
    Percent: z.number().finite().nonnegative(),
  }),
]);
const group = z.object({
  PassengerTypeCodes: refs,
  Change: z.array(z.unknown()).optional(),
  Cancel: z.array(z.unknown()).optional(),
});
const terms = z.object({ ProductRefs: refs, Penalties: z.array(z.unknown()).optional() });
const offer = z.object({
  Product: z
    .array(
      z.object({
        id: z.string(),
        FlightSegment: z.array(z.object({ sequence: z.number().int().positive() })).optional(),
      }),
    )
    .optional(),
  TermsAndConditionsFull: z.array(z.unknown()).optional(),
});

function readRule(data: z.infer<typeof rule>, action: "Change" | "Cancel"): FareRule | undefined {
  const context = {
    categories: data.penaltyTypes ?? [],
    ...(data.PenaltyAppliesTo && { appliesTo: data.PenaltyAppliesTo }),
    ...(data.PeriodBeforeDeparture && { timeWindow: data.PeriodBeforeDeparture }),
    ...(data.SegmentSequence?.length && { segments: data.SegmentSequence }),
  };
  if (data["@type"] === `${action}NotPermitted`) return { ...context, status: "prohibited" };
  if (data["@type"] !== `${action}Permitted`) return;

  const penalties: FareRulePenalty[] = (data.Penalty ?? []).flatMap((entry): FareRulePenalty[] => {
    const parsedPenalty = penalty.safeParse(entry);
    if (!parsedPenalty.success) return [];
    const fee = parsedPenalty.data;
    return fee["@type"] === "PenaltyAmount"
      ? [{ kind: "amount", value: fee.Amount.value, currency: fee.Amount.code }]
      : [{ kind: "percent", value: fee.Percent }];
  });
  if (penalties.some((fee) => fee.value > 0)) {
    return { ...context, status: "penalty", penalties };
  }
  if (penalties.length && penalties.length === data.Penalty?.length) {
    return { ...context, status: "free" };
  }
  return { ...context, status: "unknown" };
}

export function readTravelportFareRules(selectedOffer: unknown) {
  const result: { change: FareRule[]; refund: FareRule[] } = { change: [], refund: [] };
  const parsedOffer = offer.safeParse(selectedOffer);
  if (!parsedOffer.success) return result;
  const products = parsedOffer.data.Product ?? [];
  const productIds = products.map((product) => product.id);

  for (const rawTerms of parsedOffer.data.TermsAndConditionsFull ?? []) {
    const condition = terms.safeParse(rawTerms);
    if (
      !condition.success ||
      condition.data.ProductRefs?.some((ref) => !productIds.includes(ref))
    ) {
      continue;
    }
    const parentRefs = condition.data.ProductRefs ?? productIds;
    for (const rawGroup of condition.data.Penalties ?? []) {
      const entries = group.safeParse(rawGroup);
      if (
        !entries.success ||
        (entries.data.PassengerTypeCodes && !entries.data.PassengerTypeCodes.includes("ADT"))
      )
        continue;

      for (const [action, output] of [
        ["Change", result.change],
        ["Cancel", result.refund],
      ] as const) {
        for (const raw of entries.data[action] ?? []) {
          const entry = rule.safeParse(raw);
          if (!entry.success) continue;
          const scope = entry.data.ProductRefs ?? parentRefs;
          if (scope.some((ref) => !parentRefs.includes(ref))) continue;
          const segments = products
            .filter((p) => scope.includes(p.id))
            .flatMap((p) => p.FlightSegment?.map((s) => s.sequence) ?? []);
          if (entry.data.SegmentSequence?.some((number) => !segments.includes(number))) continue;
          const normalized = readRule(entry.data, action);
          if (normalized) output.push(normalized);
        }
      }
    }
  }
  return result;
}
