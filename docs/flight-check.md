# Check My Flight backend

`checkFlightServer` is an authenticated POST server function. It uses the existing
server-verified organization authorization and Travelport provider, with exact
route/date filters. Authorization errors propagate before provider execution;
provider errors and unsupported requests return `search_failed`. No new public
endpoint, session mechanism, UI, or storage is introduced.

`flightCheckSchema` extends the existing search validation with an explicit trip
type, real calendar-date checks, a user-provided total ticket price and currency,
and known/unknown baggage conditions. Passenger count currently means adults,
matching the existing Travelport request. The original price must cover every
requested passenger and is never labeled a provider-verified quote.

`compareFlightCheck` is pure and accepts normalized offers plus per-offer evidence.
The service reads that evidence from the optional `comparisonEvidence` field;
providers must populate it only when passenger count, total-price scope, mandatory
charges, and baggage scope have been verified. Search filters alone are not proof.
Absent required evidence cannot produce savings. In strict mode, known checked and cabin allowances must
match exactly; missing weight information cannot satisfy a known weight request.
No baggage fees or taxes are guessed or reconstructed.

The existing `analyzeComparablePrices` from d7d662c remains unchanged: it groups
identical flight identities against other provider offers. It cannot compare a
user's route/date specification without inventing their flight identity or fare
rules. Flight Check instead matches the requested route, local departure dates,
trip type, cabin, passenger count, currency, and known baggage conditions. It does
not claim itinerary identity. Normalized types and the existing search/provider
infrastructure are shared; no second search integration is introduced.

Prices are compared as safe integer currency minor units using Intl currency
precision. Fractional minor units, nonpositive/nonfinite amounts, and unsafe
integer ranges are rejected. Savings are clamped to zero and percentages rounded
to two decimal places. There is no currency conversion. Original and provider
prices must represent totals for the same passenger count.

Results separate comparable, insufficient, and incompatible offers and preserve
offer provider identifiers and provider fetch time. `no_better_offer_found` only
covers the returned comparable results. Missing environment metadata stays
`unknown`; test and unknown results explicitly prohibit live-bookable claims.
Travelport uses a hardcoded pre-production endpoint, so its successful search
results now explicitly carry `environment: "test"`.

Travelport now normalizes comparison evidence for documented one-way GDS adult
pricing and unambiguous baggage coverage. See [Travelport evidence rules and
remaining blockers](travelport-comparison-evidence.md). The enriched captured
fixture verifies price evidence but has ambiguous duplicate carry-on rows, so
it still cannot produce strict-mode savings. Complete synthetic normalized offers exercise
savings without weakening validation. Round trips remain unsupported. No live
validation or production readiness is claimed.

## Requirements-based mode

Existing inputs omit `mode` or set `mode: "strict_equivalence"` and retain the
same required `baggage` field, strict matching, result states and savings behavior.
The additional `mode: "requirements_match"` replaces the original baggage
specification with mandatory independent `baggageRequirements.checked` and
`baggageRequirements.cabin` selections:

```json
{
  "mode": "requirements_match",
  "baggageRequirements": {
    "checked": { "status": "required", "pieces": 1, "weightKg": 20 },
    "cabin": { "status": "not_required" }
  }
}
```

Include all existing search, trip type, originalPrice and originalCurrency fields.
Required pieces must be a positive integer; optional weightKg must be positive and
finite. Weight uses the existing normalized allowance semantics without conversion
or multiplication by piece count. Missing selections are invalid. The original
price remains an unverified, user-provided total for all passengers.

Route, dates, trip type, cabin, passengers, currency and pricing checks are shared
with strict mode. Each required baggage kind needs verified coverage of all
passengers and segments, using its independent scope or verified combined scope.
Every selected minimum must be met: extra pieces cannot compensate for missing or
insufficient weight. Not-required baggage needs no evidence. Missing allowances
or scope stay unknown. A verified failure takes precedence over unknown evidence.

Requirements results add `requirementEvaluations`, one entry per offer, containing
`offer`, `status` (`requirements_met`, `requirements_unknown`, or
`requirements_not_met`) and structured `reasons` with requirement, status and
explanation. Only fully qualifying offers enter `comparableOffers` or become
`bestComparableOffer`. The existing top-level result states are retained.
Unknown offers with verified comparable pricing and itinerary can additionally
return `priceDifference` (original minus offer total, possibly negative). This is
informational and does not enter qualifying ranking or savings. Failed offers
produce neither recommendation nor price difference. Unknown/incompatible pricing
never produces a difference. Only cheaper fully qualifying offers produce
`savingsAmount` and `savingsPercentage` in this mode; these are potential savings,
not proof of booking availability, identical fare rules or all ancillary charges.

The existing authenticated server function accepts this schema without a new
endpoint or provider path. Organization authorization, environment provenance,
empty results and search failure handling are unchanged. Round-trip provider
support is unchanged and remains unavailable.
