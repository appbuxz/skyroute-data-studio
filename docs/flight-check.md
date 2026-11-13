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
Absent evidence cannot produce savings. Known checked and cabin allowances must
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

Current blockers: Travelport does not normalize baggage or comparison evidence and
rejects round trips. Nonempty current Travelport results therefore cannot produce
savings claims; round trips return `search_failed`. Synthetic tests demonstrate
the comparison behavior when verified evidence is supplied. No live validation
has been performed. Next: normalize and verify Travelport total-price passenger
scope, mandatory charges, and baggage coverage before enabling savings claims.
