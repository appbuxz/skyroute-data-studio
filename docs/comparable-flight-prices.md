# Comparable flight prices

Global price statistics are unchanged. The separate comparison groups require at
least two offers with identical ordered outbound and inbound segment identities
(airports, carrier, flight number, exact departure/arrival timestamp strings),
summary route/timestamps, passenger composition, currency, cabin, and every known
baggage allowance, fare brand, refundable and changeable flag. Missing values are
not treated as equal to explicitly supplied values. Prices are never converted,
multiplied by passenger count or reconstructed from taxes.

Only offers with complete normalized segment lists and valid nonnegative prices
are eligible. Summary-only offers are excluded. Each eligible group reports its
minimum, maximum and absolute potential price difference, including zero.

`FlightOffer` has no passenger composition. The UI supplies it from the saved
search snapshot, never the currently edited form: the current Travelport request
sends all requested passengers as ADT. The pure grouping function accepts explicit
adult/child/infant counts per entry and keeps different compositions separate.
Future mixed-passenger requests must retain their actual composition; this change
does not claim to support them or infer passenger counts from prices.

The model also lacks complete fare rules, penalty amounts, booking classes and
per-passenger/segment baggage scope. Therefore every comparison displays
"Fare conditions not fully verified", even when the available flags agree.
Unknown baggage is not assumed to mean no baggage, and refundable/changeable
flags are not treated as full penalty terms. Potential price differences are
snapshot comparisons, not guaranteed savings or live bookable quotes. No provider,
authorization, organization scoping or normalized-data behavior is changed.
