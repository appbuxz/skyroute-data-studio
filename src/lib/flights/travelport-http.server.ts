import { getTravelportAccessToken } from "./travelport-auth.server";
import { getTravelportCredentials } from "./travelport-config.server";

export async function postTravelportAir(path: string, body: object) {
  const url = `https://api.pp.travelport.net/11/air/${path}`;
  const credentials = getTravelportCredentials();

  if (!credentials) {
    throw new Error("Travelport credentials are not configured");
  }

  const token = await getTravelportAccessToken();

  return fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Cache-Control": "no-cache",
      "Accept-Version": "11",
      "Content-Version": "11",
      ...(credentials.accessGroup
        ? { XAUTH_TRAVELPORT_ACCESSGROUP: credentials.accessGroup }
        : { "TVP-PCC-CORE": credentials.pcc! }),
      TraceId: crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}
