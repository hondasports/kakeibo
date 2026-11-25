import { verifyToken } from "@clerk/backend";
import type { SessionTokenVerifier } from "../../domain/accountDeletion/sessionTokenVerifier";

type ClerkSessionTokenVerifierOptions = {
  secretKey: string | undefined;
  jwtKey?: string;
};

/** Clerk session token 検証 port の実装。jwtKey 指定時は JWKS 取得なしで検証できる。 */
export function createClerkSessionTokenVerifier(
  options: ClerkSessionTokenVerifierOptions,
): SessionTokenVerifier {
  return {
    async verify(sessionToken) {
      if (!options.secretKey) return { kind: "invalid" };
      try {
        const claims = await verifyToken(sessionToken, {
          secretKey: options.secretKey,
          ...(options.jwtKey === undefined ? {} : { jwtKey: options.jwtKey }),
        });
        return { kind: "verified", claims };
      } catch {
        return { kind: "invalid" };
      }
    },
  };
}
