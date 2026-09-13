/** LINE webhook の X-Line-Signature 検証（HMAC-SHA256、純粋関数）。 */

const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;

function decodeBase64(value: string): Uint8Array | null {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }

  try {
    const decoded = atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function verifyLineSignature(
  rawBody: Uint8Array,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  if (!channelSecret || !signature) return false;
  const signatureBytes = decodeBase64(signature);
  if (!signatureBytes || signatureBytes.byteLength !== 32) return false;
  const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signatureBuffer).set(signatureBytes);
  const rawBodyBuffer = new ArrayBuffer(rawBody.byteLength);
  new Uint8Array(rawBodyBuffer).set(rawBody);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    HMAC_ALGORITHM,
    false,
    ["verify"],
  );
  return crypto.subtle.verify(HMAC_ALGORITHM, key, signatureBuffer, rawBodyBuffer);
}
