# Local Travelport flight search

The search form calls `searchFlightsServer`, which verifies organization membership
before calling the Travelport `FlightDataProvider` adapter. It reuses the existing
OAuth helper, pre-production search endpoint and Travelport response normalizer.
SerpApi is not used by this path; `SERPAPI_API_KEY` is not required.

Set the four OAuth variables plus one routing variable in the ignored repository-root `.env.local` on the machine
running Vite, or export them into that server process before starting it:

```dotenv
TRAVELPORT_CLIENT_ID=<approved pre-production client ID>
TRAVELPORT_CLIENT_SECRET=<approved pre-production client secret>
TRAVELPORT_USERNAME=<approved username>
TRAVELPORT_PASSWORD=<approved password>
# Choose ONE routing method (assigned by Travelport):
TRAVELPORT_ACCESS_GROUP=<assigned pre-production Access Group>
# Alternatively leave ACCESS_GROUP empty and set:
# TRAVELPORT_PCC=<assigned PCC>_<assigned GDS>
```

Never prefix these names with `VITE_`, commit real values, or put them in browser
storage. Restart Vite after changing configuration. The four OAuth values and a valid routing selector are required; configuration
validation does not prove credentials or Travelport entitlement.
The adapter uses the existing `auth.pp.travelport.net` and `api.pp.travelport.net`
pre-production services. Do not substitute production credentials.

Check presence without printing values or sending any network requests:

```sh
node --env-file=.env.local --input-type=module - <<'JS'
import { getTravelportCredentials } from './src/lib/flights/travelport-config.server.ts';
const configured = Boolean(getTravelportCredentials());
console.log(configured ? 'Travelport configuration present' : 'Travelport configuration incomplete');
process.exitCode = configured ? 0 : 1;
JS
```

The backend reads `process.env`, so explicitly load `.env.local` into the Node
process when starting local Vite (requires Node.js 22.18+):

```sh
node --env-file=.env.local ./node_modules/vite/bin/vite.js --host 0.0.0.0
```

Alternatively export these variables using your approved secret mechanism and
run `npm run dev`. Vite's client env replacement alone does not populate the
backend's non-`VITE_` variables. Never add secrets to Vite `define` or `envPrefix`.
Opening `/search` does not send a Travelport search; submitting the form does.
Only submit after approval for a real provider request.
One-way searches map the actual route, date, adult passenger count and cabin.
Round trips are explicitly rejected before OAuth/search: the existing normalizer
supports one-way, single-product variants only. Unsupported variants return an
error rather than incomplete results. Airport timezone coverage is also limited
to the existing airport map. No fake offers or fixture fallback is used.


## Exact authentication and routing contract

OAuth uses `POST https://auth.pp.travelport.net/oauth/token`, with
`Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`,
and form fields `grant_type=password`, `client_id`, `client_secret`, `username`,
`password`. PCC and Access Group are not sent to the token endpoint. The server
keeps the token only in memory, reusing it until expiry minus 60 seconds (24 hours
if no lifetime is supplied); changing OAuth credentials invalidates that cache.

Search uses `POST https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings`.
Headers: `Authorization: Bearer <server token>`, `Content-Type: application/json`,
`Accept: application/json`, `Accept-Version: 11`, `Content-Version: 11`,
`Accept-Encoding: gzip, deflate`, `Cache-Control: no-cache`, optional `TraceId`,
and exactly one routing header selected by configuration:

- `TRAVELPORT_ACCESS_GROUP` becomes `XAUTH_TRAVELPORT_ACCESSGROUP`.
- Otherwise `TRAVELPORT_PCC` becomes `TVP-PCC-CORE`. Its value MUST contain both
  your assigned PCC and assigned GDS, separated by `_`. Do not invent a GDS suffix.

AirSearch supports both mechanisms; they are alternatives. If both variables are
set, the adapter sends only Access Group, matching Travelport precedence. An
invalid nonempty Access Group fails configuration rather than silently falling
back to PCC. Access Group is validated as 36 alphanumeric/underscore/hyphen
characters; PCC routing follows the documented 3–4 alphanumeric PCC plus a
2-character GDS suffix. Configured passwords and tokens must never be logged.

## Where to find your assigned values

| Variable | Official source |
| --- | --- |
| `TRAVELPORT_CLIENT_ID`, `TRAVELPORT_CLIENT_SECRET` | TripServices provisioning/onboarding email; client credentials for your managed identity in MyTravelport Credential Access Manager |
| `TRAVELPORT_USERNAME`, `TRAVELPORT_PASSWORD` | Trial provisioning email, or a pre-production primary/managed TripServices identity created by your administrator in MyTravelport → Administration → Manage Users → Credential Access Manager |
| `TRAVELPORT_ACCESS_GROUP` | Provisioning welcome letter or the identity's assigned PCC/access-group content in Credential Access Manager |
| `TRAVELPORT_PCC` | Assigned PCC and GDS from your welcome letter/administrator; use their complete `PCC_GDS` routing value |

These are TripServices API identity credentials, not automatically your developer
portal login. In an already configured customer Postman DevKit, inspect the OAuth
request's Body fields and the AirSearch request's active routing header/environment
locally. Variable names in DevKits may differ: map their resolved values to the
names above. The public DevKit has examples, not your company's credentials. Do
not copy example PCCs, Access Groups, or tokens. If missing, ask your Travelport
administrator/account contact for the pre-production assignment; do not send live
requests merely to discover it.

Edit only the Travelport entries in `.env.local`, preserving all existing Supabase
entries. Do not display the file in logs. Run the offline configuration check above
and then restart the server; do not submit the search form until live testing is
explicitly approved.

Official references:
- [Authentication and credential provisioning](https://developer.travelport.com/docs/getting-started/authentication)
- [OAuth form request](https://developer.travelport.com/apis/flights/authentication)
- [v11 common headers and routing alternatives](https://support.travelport.com/webhelp/JSONAPIs/Airv11/Content/Air11/General/CommonAirHeaders.htm)
- [AirSearch endpoint and routing header schema](https://developer.travelport.com/apis/flights/searches/createairsearch)
