import { getTravelportCredentials } from "./travelport-config.server";

const AUTH_URL = "https://auth.pp.travelport.com/oauth/token";

interface TravelportTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export async function getTravelportAccessToken(): Promise<string> {
  const credentials = getTravelportCredentials();

  if (!credentials) {
    throw new Error("Travelport credentials are not configured");
  }

  const response = await fetch(AUTH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
      grant_type: "password",
    }),
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

  return (data as TravelportTokenResponse).access_token;
}
