import { z } from "zod";
import { getTravelportCredentials } from "./travelport-config.server";

const text = z.string().min(1);
const checkout = z.object({
  userId: text,
  organizationId: text.optional(),
  reference: z.object({ catalogId: text, offerId: text, productId: text }),
  searchPrice: z.object({
    amount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  expiresAt: z.number().finite(),
});
type Checkout = z.infer<typeof checkout>;

const encoder = new TextEncoder();
const nonceLength = 12;

export async function getCheckoutKey(): Promise<CryptoKey | undefined> {
  const credentials = getTravelportCredentials();
  if (!credentials) return;
  const source = await crypto.subtle.importKey(
    "raw",
    encoder.encode(credentials.clientSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(credentials.clientId),
      info: encoder.encode("Flight Analytics Travelport checkout v1"),
    },
    source,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealCheckout(value: Checkout, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(nonceLength));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const bytes = new Uint8Array(iv.length + encrypted.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function openCheckout(token: string): Promise<Checkout | undefined> {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(token)) return;
  const key = await getCheckoutKey();
  if (!key) return;
  try {
    const bytes = Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
      char.charCodeAt(0),
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, nonceLength) },
      key,
      bytes.subarray(nonceLength),
    );
    const parsed = checkout.safeParse(JSON.parse(new TextDecoder().decode(decrypted)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
