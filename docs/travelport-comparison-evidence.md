# Travelport comparison evidence (offline)

Implemented for one-way, single-product **GDS, adult-only** offers. Other search
normalization behavior, price values, Flight Check requirements and provider test
provenance remain unchanged. No live provider requests were made.

Semantic source: [Travelport v11 Search API reference](https://support.travelport.com/webhelp/JSONAPIs/Airv11/Content/Air11/Search/APIRef_Search.htm),
reviewed 2026-11-13: ProductBrandOffering/BestCombinablePrice, PriceBreakdown,
Amount and ReferenceListTermsAndConditions/BaggageAllowance tables. The reference
specifies one-way itinerary pricing, group totals, per-passenger breakdowns,
passenger type quantities, tax/fee totals, and baggage inclusion and applicability.
It also warns of approximate AA NDC breakdowns; NDC is deliberately unsupported.
This is provider documentation plus captured shape evidence, not a claim that
arithmetic consistency alone establishes provider semantics.

| Normalized field              | Required response evidence                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| price.amount / currency       | Existing unchanged copy of BestCombinablePrice.TotalPrice / CurrencyCode.value. No currency conversion, price multiplication or adding taxes.                                                                                                                                                                          |
| comparisonEvidence.passengers | Exactly one ADT PassengerFlight, passengerQuantity matching the sole PriceBreakdownAir.quantity and requestedPassengerType ADT. Product.Quantity is not used.                                                                                                                                                          |
| priceScope                    | Per-passenger PriceBreakdown.Amount.Total times quantity must equal TotalPrice; Amount currency must match offer currency.                                                                                                                                                                                             |
| mandatoryChargesIncluded      | Explicit Base, TotalTaxes and TotalFees at group level and explicit Amount.Base, Taxes.TotalTaxes, Fees.TotalFees and Total at passenger level. Each sum and each quantity-weighted component must reconcile. Missing fees are unknown, never zero.                                                                    |
| baggage.checked / cabin       | Unique TermsAndConditions reference; exactly one FirstCheckedBag / CarryOn entry. Explicit ProductRef must be a nonempty array of distinct, nonblank, unpadded IDs containing the selected product. passengerTypeCodes and SegmentSequenceList must cover the adult PTC and every segment, with no duplicate segments. |
| pieces                        | Exactly one BaggageItem with soldByPieceInd true and explicit includedInOfferPrice Yes gives quantity; No gives zero included pieces. Unknown/missing inclusion stays unknown. Higher checked-bag entries must be explicitly paid; included or ambiguous higher allowances block checked normalization.                |
| weightKg                      | Explicit Measurement with measurementType Weight and unit Kilograms. Free Text is never parsed; pounds and weight-only allowances remain unsupported.                                                                                                                                                                  |
| baggageScopes.checked / cabin | Each independently normalized allowance records all_passengers_all_segments only after its passenger, product and full segment coverage checks pass. Missing per-kind scope remains unknown.                                                                                                                           |
| baggageScope                  | Both checked and cabin allowances must pass the full coverage checks. Strict Flight Check still requires this combined flag and both allowances; per-kind flags alone do not enable comparison.                                                                                                                        |

Limitations: multiple PTCs, multiple passenger rows, multiple breakdowns, bundled
ancillary pricing, NDC, multiple products, duplicate baggage rows, weight-only
allowances, unsupported measurement units and incomplete reference coverage are
not promoted into complete comparison evidence. Duplicate carry-on descriptions
may mean distinct items or conflicting conditions; they are neither summed nor
collapsed. Brand inclusion alone cannot establish a quantity or applicability.
Text remains available in the response fixture as context, but is not a verified
allowance. No baggage fee is added to a fare. Strict-mode savings still require the user's
known baggage specification to match the normalized allowances exactly.

## Fixtures and remaining blocker

`src/lib/flights/fixtures/travelport-comparison.json` enriches the existing core
schedule subset using the same ignored sanitized local HTTP 200 capture. Added
fields are whitelisted price breakdowns, ContentSource, passenger type codes,
terms references, baggage inclusion, quantities, measurements and descriptions.
URLs, baggage fees, payment deadlines, penalties and identifiers unrelated to
internal reference resolution are omitted. No credentials or customer data are
included. Original fixture and ignored capture are unchanged.

The enriched real-response subset verifies one-adult total price and included
provider taxes/fees. It does **not** supply complete comparison baggage evidence:
carry-on has multiple description rows. The older core/mixed-cabin subsets omit
price and baggage evidence entirely. They must still normalize without savings.
Synthetic additions in travelport-comparison.test.ts exercise documented complete
and incomplete structures, including multiple adults, without claiming those
structures were observed in a multi-passenger live response.

Before real verification: establish a documented, unambiguous interpretation of
multiple carry-on rows (and their relationship to allowance-level Text), obtain
complete baggage coverage/weights required by the user's specification, and
verify multi-adult pricing in an authorized provider response. AirPrice/bookability,
production account semantics and production provenance are not verified here.

## Requirements-mode fixture qualification

Requirements mode does not need allowance evidence for explicitly not-required
baggage. The captured comparison fixture can therefore qualify with both kinds
explicitly not required, subject to matching itinerary/passengers/currency and
verified pricing. Checked baggage requirements depend on the actual normalized
checked allowance; no positive allowance is inferred. Selecting required cabin
baggage still produces `requirements_unknown` because duplicate carry-on rows
remain ambiguous. The fixture and normalization rules are unchanged. Strict mode
continues to require complete baggage equivalence and cannot qualify this fixture.
The provider verification blockers above still apply.
