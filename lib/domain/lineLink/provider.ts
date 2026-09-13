export type LineIdTokenClaims = {
  sub: string;
  nonce: string;
  aud: string | string[];
  iss: string;
  exp: number;
};

export type LineProviderInput = {
  code: string;
  codeVerifier: string;
  expectedNonceHash: string;
  channelId: string;
  channelSecret: string;
  redirectUri: string;
};

export type LineProviderIdentity = { lineUserId: string; nonceHash: string };

export interface LineProviderClient {
  exchangeAndVerify(input: LineProviderInput): Promise<LineProviderIdentity>;
}

export class LineProviderError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string) {
    super(reasonCode);
    this.reasonCode = reasonCode;
  }
}

export function validateLineIdTokenClaims(
  claims: LineIdTokenClaims,
  expectedNonceHash: string,
  channelId: string,
  nowSeconds: number,
  hash: (value: string) => string,
): LineProviderIdentity {
  const validAudienceShape =
    typeof claims?.aud === "string" ||
    (Array.isArray(claims?.aud) && claims.aud.every((audience) => typeof audience === "string"));
  if (
    !claims ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.nonce !== "string" ||
    !validAudienceShape ||
    typeof claims.iss !== "string" ||
    typeof claims.exp !== "number"
  ) {
    throw new LineProviderError("INVALID_CALLBACK");
  }
  if (hash(claims.nonce) !== expectedNonceHash) throw new LineProviderError("INVALID_NONCE");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(channelId)) throw new LineProviderError("INVALID_AUDIENCE");
  if (claims.iss !== "https://access.line.me") throw new LineProviderError("INVALID_ISSUER");
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
    throw new LineProviderError("INVALID_EXPIRY");
  }
  return { lineUserId: claims.sub, nonceHash: hash(claims.nonce) };
}
