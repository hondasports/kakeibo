import { createHash, randomBytes } from "node:crypto";
import { LineProviderError } from "../../domain/lineLink/provider";
import type {
  LineIdTokenClaims,
  LineProviderClient,
  LineProviderInput,
} from "../../domain/lineLink/provider";
import { validateLineIdTokenClaims as validateClaims } from "../../domain/lineLink/provider";

const LINE_TOKEN_ENDPOINT = "https://api.line.me/oauth2/v2.1/token";
const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const PROVIDER_TIMEOUT_MS = 10_000;

export function randomUrlSafeValue(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function validateLineIdTokenClaims(
  claims: LineIdTokenClaims,
  expectedNonceHash: string,
  channelId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return validateClaims(claims, expectedNonceHash, channelId, nowSeconds, sha256);
}

export async function exchangeAndVerifyLineCode(
  input: LineProviderInput,
  fetchImpl: typeof fetch = fetch,
) {
  let tokenResponse: Response;
  try {
    tokenResponse = await fetchImpl(LINE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: input.channelId,
        client_secret: input.channelSecret,
        code_verifier: input.codeVerifier,
      }),
    });
  } catch {
    throw new LineProviderError("PROVIDER_UNAVAILABLE");
  }
  if (!tokenResponse.ok) throw new LineProviderError("INVALID_CALLBACK");
  let tokenBody: { id_token?: unknown };
  try {
    tokenBody = (await tokenResponse.json()) as { id_token?: unknown };
  } catch {
    throw new LineProviderError("INVALID_CALLBACK");
  }
  if (typeof tokenBody.id_token !== "string") throw new LineProviderError("INVALID_CALLBACK");

  let verifyResponse: Response;
  try {
    verifyResponse = await fetchImpl(LINE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      body: new URLSearchParams({ id_token: tokenBody.id_token, client_id: input.channelId }),
    });
  } catch {
    throw new LineProviderError("PROVIDER_UNAVAILABLE");
  }
  if (!verifyResponse.ok) throw new LineProviderError("INVALID_CALLBACK");
  let claims: LineIdTokenClaims;
  try {
    claims = (await verifyResponse.json()) as LineIdTokenClaims;
  } catch {
    throw new LineProviderError("INVALID_CALLBACK");
  }
  return validateLineIdTokenClaims(claims, input.expectedNonceHash, input.channelId);
}

export const lineProviderClient: LineProviderClient = {
  exchangeAndVerify: exchangeAndVerifyLineCode,
};
