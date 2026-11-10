import { getTravelportCredentials, type TravelportCredentials } from "./travelport-config.server";

const AUTH_URL = "https://auth.pp.travelport.net/oauth/token";

interface TravelportTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

let cached: { credentials: TravelportCredentials; token: string; expiresAt: number } | undefined;

export async function getTravelportAccessToken(): Promise<string> {
  const credentials = getTravelportCredentials();

  if (!credentials) {
    throw new Error("Travelport credentials are not configured");
  }
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    (["clientId", "clientSecret", "username", "password"] as const).every(
      (key) => cached!.credentials[key] === credentials[key],
    )
  )
    return cached.token;

  const response = await fetch(AUTH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
      grant_type: "password",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Travelport authentication failed (HTTP ${response.status})`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== "object" ||
    data === null ||
    !("access_token" in data) ||
    typeof data.access_token !== "string" ||
    !data.access_token
  ) {
    throw new Error("Travelport returned an invalid token response");
  }

  const result = data as TravelportTokenResponse;
  const lifetime = result.expires_in === undefined ? 86_400 : result.expires_in;
  const seconds =
    typeof lifetime === "number" && Number.isFinite(lifetime)
      ? Math.max(0, Math.min(lifetime, 86_400) - 60)
      : 0;
  cached = { credentials, token: result.access_token, expiresAt: Date.now() + seconds * 1000 };
  return result.access_token;
}
