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
savings without weakening validation. Round trips remain unsupported. Fixture
testing alone does not establish provider or production readiness; the controlled
Preproduction verification below records the later observed results.

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

## Controlled Preproduction verification — 2026-11-13

One authorized JFK → LAX one-way GDS search for 2026-12-03, one adult,
economy, reused the existing OAuth, routing and request configuration without a
currency override. Credentials were checked for presence/validity without printing
values; both configured endpoints were confirmed as Preproduction. OAuth and
Flight Search each returned HTTP 200. A sandbox DNS failure occurred before an
HTTP response; the controlled harness was rerun with approved network access.
There were no automatic retries, production, AirPrice, booking, ticketing or
payment requests.

The response contained 21 catalog rows and 261 offer variants. Of these, 217
normalized and 44 were skipped with `INVALID_DATETIME_OR_TIMEZONE`. All 217
normalized prices were **GBP**, with verified one-adult all-passenger totals and
mandatory-charge completeness. Checked allowance/scope evidence was available for
217 offers; cabin allowance/scope evidence for 101.

With `requirements_match` and both baggage kinds explicitly `not_required`, 126
offers qualified, zero were unknown, and 91 were unmet. The **GBP 726.00 original
price was an explicitly synthetic, user-provided test input**, not a purchased or
independently discovered fare. The best qualifying Preproduction alternative was
GBP 190.10: potential savings GBP 535.90 (73.82%). Original-price provenance stayed
`user_provided`, and provider provenance stayed `test`.

Requiring one cabin bag yielded 49 qualifying, 77 unknown and 91 unmet offers.
The 116-offer subset lacking known cabin evidence had zero qualifying offers
(77 unknown, 39 incompatible), and no savings. Synthetic in-memory negative
controls removing price scope, invalidating the amount or changing currency
produced neither savings nor informational price differences. They were test
controls, not observed provider defects.

This exercised the existing provider adapter, OAuth, search, normalization,
input schema and pure comparison engine. It **did not exercise** the authenticated
callable Flight Check service, bearer verification, organization authorization or
the application UI. No authenticated local application session was available.
Preproduction results are not live bookable fares, production verification, or
proof of equivalent fare conditions. The raw response was kept only in memory.

### Exclusion investigation (offline, no further provider requests)

The normalizer sets `INVALID_DATETIME_OR_TIMEZONE` immediately before resolving
segment airport timezones and converting local departure/arrival dates and times.
The code includes unknown-airport failures, invalid calendar/time inputs, and
nonexistent or ambiguous local times. Tests cover unknown airports, seasonal
US offsets, DST gaps/overlaps, and Phoenix's lack of DST. No timezone validation
was relaxed.

The existing ignored sanitized capture
`travelport-fixtures.local/travelport-v11-preproduction-jfk-lax.sanitized.json`
normalizes 130 variants, skips two for `UNSUPPORTED_CABIN`, and encounters no
unmapped airports. The committed core and comparison fixtures each normalize four
variants without exclusions; the mixed-cabin fixture normalizes four and skips
one for `UNSUPPORTED_CABIN`. None reproduces the 44 datetime/timezone exclusions.
The discarded verification response is needed to establish their concrete cause;
no implementation defect or specific missing timezone was demonstrated.

In requirements mode, the current result contract exposes structured reasons for
checked baggage, cabin baggage, compatibility and pricing. Compatibility failures
share the combined explanation “Route, dates, trip type, cabin, passengers or
currency incompatible”; individual mismatched fields are not identified. This
also covers segment itinerary/date checks. The recorded aggregates do not establish
why the 91 offers were incompatible. No cabin, nearby-airport or date mismatch is
inferred. Detailed mismatch diagnostics remain a future improvement.

## First Check My Flight interface

`/check-my-flight` lives inside the authenticated workspace and uses
`checkFlightServer` through `useServerFn`, with the selected organization passed
explicitly. The server continues to verify identity and organization membership.
The page offers one-way adult searches and explicit independent baggage minimums
in requirements mode, with no saved/synthetic provider results or automatic search.
Results distinguish qualifying, conditional and incompatible offers, disclose test
provenance, and retain the user-provided original-price label. Unknown evidence
cannot be presented as qualifying savings. Strict comparison behavior is unchanged.

Local manual verification (without another provider request): start the application
using `node --env-file=.env.local ./node_modules/vite/bin/vite.js`, open the printed
local URL at `/check-my-flight`, sign in at `/login` with an existing authorized
account, then open `/check-my-flight` again if login lands on the dashboard. Select
an assigned organization in the sidebar if needed. Confirm the
page, one-way form, required fields and explicit baggage selections. Submit only
an incomplete form to inspect validation; do not submit a valid form, because that
would send another provider search. Automated UI tests mock the callable and cover
result states. A valid authenticated submission remains pending a separately
authorized provider run and an authorized account with organization membership.

Validation of the first UI (2026-11-13): 320 relevant tests passed across 21 files
(253 flight backend tests; 67 frontend/routing/workspace tests, including 22 new
mocked-callable page tests). TypeScript `tsc --noEmit`, ESLint on changed TypeScript
files, `npm run build`, and `git diff --check` passed. The new page tests cover
validation, explicit baggage selections, payload shape, loading/duplicate guards,
errors, all result states, pricing/requirements disclosures, and removal of stale
results after edits or organization changes. Browser inspection of the real local
route confirmed signed-out redirection to `/login` with no Check My Flight form
rendered. Signed-in visual/mobile inspection and a real authenticated submission
remain unverified. No additional provider requests were made for UI development.

## Authenticated-request abort investigation — 2026-11-13

The user reported repeated `Error: aborted` / `abortIncoming` /
`socketOnClose` stacks with status 500 during local application use. The failing
browser's Network entry was not retained. Available local server logs do not
contain that incident or a correlated request path. The connected diagnostic
browser is signed out, so it is not the user's failing authenticated session.
**Whether the historical request reached Flight Check or contacted Travelport
cannot be established from the remaining evidence.**

Inspection of the installed Node HTTP implementation shows `socketOnClose`
destroying pending incoming requests with `ConnResetException('aborted')`.
The stack concerns the local incoming connection, not an outgoing Travelport
HTTP response. It does not identify the browser action or intermediary that
closed the connection, or prove which application endpoint was involved.
TanStack reads a POST's serialized JSON body before invoking its callable action;
a body read failure can therefore happen before input validation, authentication,
organization authorization or the provider. Error wrappers can report this as
500 even though the peer has already disconnected. No error handling was changed
or suppressed.

Code inspection found:

- The page calls the existing POST callable only after explicit valid submission.
  Its lifecycle/scope guards ignore stale results; they do not abort HTTP requests.
- The managed client middleware attaches the bearer session; server-side identity
  verification and membership/RLS checks still precede provider execution. No
  alternate session or authorization bypass was introduced.
- Session and membership loading are separate GET callables. Their lifecycle
  guards also ignore stale results without cancelling transport requests.
- TanStack forwards an explicitly supplied signal to its fetch transport. These
  application calls do not supply one. Browser navigation or connection closure
  can still end an incoming request independently of application guards.
- OAuth and search use separate 15-second and 30-second timeout signals. The
  incoming request's abort signal is not forwarded to them. Provider errors are
  converted to a Flight Check `search_failed` result. No timeout or retry policy
  was changed.
- The managed Vite configuration installs the dev request adapter; Nitro handles
  the build. No parallel adapter or configuration change was introduced.

### Isolated HTTP reproduction (mocked external services)

A temporary Node harness served the existing compiled SSR application using the
installed `srvx` Node adapter. It sent TanStack/Seroval HTTP requests to actual
compiled callable IDs, retaining the real validators, authentication code,
organization authorization, provider adapter and engine. **Only external responses
were mocked:** identity verification, RLS membership queries, OAuth and the saved
sanitized comparison fixture. Synthetic identity/organization values were used;
no real session or provider credentials were needed. The harness blocked all
other external fetches. This verifies the compiled HTTP boundary with mocked
services, not a real user login, real RLS policy enforcement or a real provider run.

| Controlled case                             | Observed result                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Signed-out session lookup                   | HTTP 200, null user, no upstream calls                                                                        |
| Mock-authenticated session lookup           | HTTP 200 after identity verification request                                                                  |
| Membership loading                          | HTTP 200 after identity and membership requests                                                               |
| Flight Check without bearer                 | HTTP 401; no identity, membership or provider requests                                                        |
| Identity service rejects bearer             | HTTP 401; no membership or provider requests                                                                  |
| Organization membership denied              | HTTP 403; no provider requests                                                                                |
| Authorized Flight Check with mock upstreams | HTTP 200, `better_offer_found`, `test` environment and `user_provided` original price                         |
| Simulated provider timeout                  | HTTP 200, `search_failed`; no incoming-abort error                                                            |
| Intentionally disconnected incomplete POST  | Reproduced `aborted` / `abortIncoming` before handler execution; no identity, membership or provider requests |

All harness assertions passed, with zero real provider requests and zero
unexpected external fetches. The deliberate disconnect is a reproduction of the
stack, **not proof of the historical cause**. A separate cold Vite direct-RPC
probe encountered callable registration errors without the normal browser client
module-loading sequence; those were different errors, not the reported abort.
It does not establish a normal application-navigation defect. Full authenticated
dev-browser transport verification remains outstanding. No concrete application
implementation defect was demonstrated, so no runtime fix or rule change was made.

### Safe next manual diagnostic

Start the local server with approved environment configuration and keep its
terminal visible. Before opening `/check-my-flight`, open browser DevTools →
Network, enable **Preserve log**, and select **Fetch/XHR**. Sign in normally with
an assigned organization, open the page, and inspect the separate session and
membership requests. Do not submit a valid flight check or resend an old request.
Opening the page, loading organizations and navigating between existing workspace
pages do not intentionally invoke the Flight Check provider.

If the abort recurs, record only the timestamp, request method, pathname (omit
query values), status/cancellation message, Timing duration, Initiator filename
and the surrounding action (page load, organization load or navigation). Record
only a sanitized error name/message from the response, if readable. Do not export
a HAR or copy headers, cookies, request bodies, bearer tokens, session values or
provider identifiers. A future valid submission requires separately authorized
Preproduction testing; another provider search is not needed to investigate the
safe page-load/navigation path first.

Post-investigation validation: 383 relevant automated tests passed (253 flight
backend, 63 authentication/organization backend, and 67 frontend/routing/workspace).
TypeScript, ESLint on the existing UI change set, and `git diff --check` passed.
The nine isolated HTTP diagnostic cases above also passed their assertions.
Only documentation changed during this investigation; temporary diagnostic scripts
and sanitized outcome logs are in `/tmp`. No provider calls, runtime fixes,
automatic retries, commits or pushes were made.
