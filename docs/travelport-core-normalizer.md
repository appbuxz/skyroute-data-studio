# Travelport v11 core normalization

Evidence: local sanitized HTTP 200 pre-production response from POST
`/11/air/catalog/search/catalogproductofferings`. No network is used by the normalizer.

The observed response has 17 CatalogProductOffering rows, containing 132
ProductBrandOffering variants under ProductBrandOptions. A catalog row is a group,
not an individual priced offer. Each observed variant has one Product.productRef,
resolved against ReferenceList.Product.id. Product.FlightSegment is ordered by
sequence and resolves Flight.FlightRef against ReferenceList.Flight.id. This order
must match the option's flightRefs. There is no separate Journey object in this
fixture. Product.totalDuration is the journey duration; Flight.duration is segment
duration. BestCombinablePrice.TotalPrice and CurrencyCode.value are copied without
conversion, multiplication by passenger count, or recalculation from taxes.

Each accepted variant becomes a separate FlightOffer. This is a search result,
not a guarantee of bookability. IDs are deterministic within a response, not stable
booking identifiers. Multiple-product variants and broken references are skipped.
Only a single outbound journey is supported; cross-bound combinability and return
trip assembly are outside this module's contract.

PassengerFlight.passengerQuantity is validated; Product.Quantity is not treated as
passenger count. FlightOffer has no passenger-count field, so it is not emitted.
All passenger/segment cabin assignments must be present and uniform; mixed cabins
are skipped rather than reduced to a fabricated cabin. Flight.carrier and number
supply marketing carrier and flight number; operating carriers are not substituted.

Local date/time fields have no offset. Conversion uses the existing airport timezone
resolver (or an explicitly supplied resolver), never a guessed UTC offset. The
default resolver now covers all airports in the captured fixture using verified
mappings documented in airport-timezone-sources.md. The full fixture produces
130 offers and skips 2 mixed/unsupported cabin variants, with no timezone failures.
Catalog sequence values other than 1 are rejected: return-bound assembly is not
supported.

Malformed envelopes and duplicate reference IDs throw a fixed safe error. Invalid
variants are skipped with index-only diagnostics and fixed reason codes. Optional
durations may be absent; present unsupported duration formats cause a skip. Baggage,
brands, penalties, availability and expiry are deliberately not emitted.

`src/lib/flights/fixtures/travelport-core.json` is a field-whitelisted real-response
subset: two catalogs, four products, three flights. It was reviewed separately:
only internal references, public schedules, cabin, passenger count, durations and
prices remain. No credentials, sessions, trace IDs, customer data, terms or URLs
are included. It is fixture-backed coverage; mutations in unit tests are synthetic
negative cases. The original local fixture remains ignored and unchanged.
