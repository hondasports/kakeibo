export type SessionTokenClaims = {
  iss?: unknown;
  sub?: unknown;
  fva?: unknown;
};

export type SessionTokenVerification =
  | { kind: "verified"; claims: SessionTokenClaims }
  | { kind: "invalid" };

export type SessionTokenVerifier = {
  verify: (sessionToken: string) => Promise<SessionTokenVerification>;
};
