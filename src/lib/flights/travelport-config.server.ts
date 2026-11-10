export interface TravelportCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  pcc: string | undefined;
  accessGroup: string | undefined;
}

export function getTravelportCredentials(): TravelportCredentials | null {
  const clientId = process.env["TRAVELPORT_CLIENT_ID"]?.trim();
  const clientSecret = process.env["TRAVELPORT_CLIENT_SECRET"]?.trim();
  const username = process.env["TRAVELPORT_USERNAME"]?.trim();
  const password = process.env["TRAVELPORT_PASSWORD"]?.trim();
  const pcc = process.env["TRAVELPORT_PCC"]?.trim() || undefined;
  const accessGroup = process.env["TRAVELPORT_ACCESS_GROUP"]?.trim() || undefined;

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }
  // Access Group takes precedence, as specified by Travelport v11.
  if (
    accessGroup
      ? !/^[A-Za-z0-9_-]{36}$/.test(accessGroup)
      : !pcc || !/^[A-Za-z0-9]{3,4}_\w{2}$/.test(pcc)
  ) {
    return null;
  }

  return { clientId, clientSecret, username, password, pcc, accessGroup };
}
