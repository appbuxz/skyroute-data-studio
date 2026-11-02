export interface TravelportCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  pcc: string;
}

export function getTravelportCredentials(): TravelportCredentials | null {
  const clientId = process.env["TRAVELPORT_CLIENT_ID"]?.trim();
  const clientSecret = process.env["TRAVELPORT_CLIENT_SECRET"]?.trim();
  const username = process.env["TRAVELPORT_USERNAME"]?.trim();
  const password = process.env["TRAVELPORT_PASSWORD"]?.trim();
  const pcc = process.env["TRAVELPORT_PCC"]?.trim();

  if (!clientId || !clientSecret || !username || !password || !pcc) {
    return null;
  }

  return { clientId, clientSecret, username, password, pcc };
}
