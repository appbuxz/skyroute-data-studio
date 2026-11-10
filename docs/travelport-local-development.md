# Local Travelport flight search

The search form calls `searchFlightsServer`, which verifies organization membership
before calling the Travelport `FlightDataProvider` adapter. It reuses the existing
OAuth helper, pre-production search endpoint and Travelport response normalizer.
SerpApi is not used by this path; `SERPAPI_API_KEY` is not required.

Set all five variables in the ignored repository-root `.env.local` on the machine
running Vite, or export them into that server process before starting it:

```dotenv
TRAVELPORT_CLIENT_ID=<approved pre-production client ID>
TRAVELPORT_CLIENT_SECRET=<approved pre-production client secret>
TRAVELPORT_USERNAME=<approved username>
TRAVELPORT_PASSWORD=<approved password>
TRAVELPORT_PCC=<approved PCC>
```

Never prefix these names with `VITE_`, commit real values, or put them in browser
storage. Restart Vite after changing configuration. All five values must be
nonblank; their presence does not prove validity or Travelport entitlement.
The adapter uses the existing `auth.pp.travelport.com` and `api.pp.travelport.net`
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

Alternatively export the five variables using your approved secret mechanism and
run `npm run dev`. Vite's client env replacement alone does not populate the
backend's non-`VITE_` variables. Never add secrets to Vite `define` or `envPrefix`.
Opening `/search` does not send a Travelport search; submitting the form does.
Only submit after approval for a real provider request.
One-way searches map the actual route, date, adult passenger count and cabin.
Round trips are explicitly rejected before OAuth/search: the existing normalizer
supports one-way, single-product variants only. Unsupported variants return an
error rather than incomplete results. Airport timezone coverage is also limited
to the existing airport map. No fake offers or fixture fallback is used.
