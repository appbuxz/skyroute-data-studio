export interface TravelportCredentials {
  clientId: string;
  clientSecret: string;
}

export function getTravelportCredentials(): TravelportCredentials | null {
  const clientId = process.env['TRAVELPORT_CLIENT_ID']?.trim();
  const clientSecret = process.env['TRAVELPORT_CLIENT_SECRET']?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}
