# Verified US airport timezone mappings

Verified on 2026-11-10. Candidate mappings were checked against independent
airport locations and IANA region/rule definitions, not used as evidence themselves.

| Airport | Location                     | IANA timezone       |
| ------- | ---------------------------- | ------------------- |
| ONT     | Ontario, California          | America/Los_Angeles |
| PHX     | Phoenix, Arizona             | America/Phoenix     |
| LGA     | New York LaGuardia, New York | America/New_York    |
| DFW     | Dallas/Fort Worth, Texas     | America/Chicago     |
| BUR     | Burbank, California          | America/Los_Angeles |
| CLT     | Charlotte, North Carolina    | America/New_York    |
| EWR     | Newark, New Jersey           | America/New_York    |
| SNA     | Orange County, California    | America/Los_Angeles |
| ORD     | Chicago O'Hare, Illinois     | America/Chicago     |
| BOS     | Boston, Massachusetts        | America/New_York    |

Location evidence:

- Phoenix airport's [destination directory](https://www.skyharbor.com/flights/where-we-fly/)
  explicitly lists city, state and airport codes for ONT, DFW, BUR, CLT, EWR,
  SNA, ORD and BOS and identifies its own airport as PHX.
- FAA [Core 30](https://aspmhelp.faa.gov/index/Core_30.html) identifies LGA as
  New York LaGuardia and independently identifies PHX, DFW, CLT, EWR and ORD.
- FAA [capacity profiles](https://www.faa.gov/airports/planning_capacity/profiles)
  independently identify BOS, CLT, DFW and EWR.

Timezone inference from verified locations:

- [49 CFR Part 71](https://www.ecfr.gov/current/title-49/subtitle-A/part-71)
  defines US standard timezone boundaries. These locations are in Pacific,
  Mountain (Phoenix), Central (Dallas/Chicago), and Eastern zones respectively.
- IANA [zone.tab](https://data.iana.org/time-zones/tzdb/zone.tab) identifies
  America/Los_Angeles as Pacific, America/Chicago as Central (most areas),
  America/New_York as Eastern (most areas), and America/Phoenix as Arizona
  except Navajo territory. Phoenix airport is not in Navajo territory.
- IANA [northamerica](https://data.iana.org/time-zones/tzdb/northamerica)
  supplies the US DST rules and the Phoenix zone's permanent MST rule since 1968.

Mappings select IANA regions; no numeric offset is stored in the resolver.
Existing Intl-based conversion computes date-specific offsets. Tests cover winter,
summer, spring gaps and autumn overlaps for every added DST-observing airport,
and verify Phoenix has neither transition. No UTC fallback was introduced.
