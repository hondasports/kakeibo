import { getLineLinkFeedback } from "../../domain/lineLink/feedback";
import type { LineLinkFeedback } from "../../domain/lineLink/feedback";
import type { LineLinkActionRunner } from "../../domain/lineLink/actionRunner";
import type { LineIntegrationMode } from "../../domain/lineLink/integrationMode";
import { LineProviderError } from "../../domain/lineLink/provider";
import type { LineProviderClient } from "../../domain/lineLink/provider";
import type { LineLoginConfiguration } from "./startLineLink";

export type CompleteLineLinkDeps = {
  runner: LineLinkActionRunner;
  provider: LineProviderClient;
  getMode(): LineIntegrationMode;
  getRealConfiguration(): LineLoginConfiguration;
  hash(value: string): string;
};

export async function completeLineLink(
  deps: CompleteLineLinkDeps,
  userId: string,
  args: { state: string; code: string },
): Promise<LineLinkFeedback> {
  if (!args.state || !args.code || args.state.length > 512 || args.code.length > 2048) {
    return getLineLinkFeedback("INVALID_CALLBACK");
  }

  const claim = await deps.runner.claimRequest(deps.hash(args.state), userId);
  if (!claim.ok) return getLineLinkFeedback(claim.reason);

  try {
    const mode = deps.getMode();
    const identity =
      mode === "mock"
        ? resolveMockIdentity(args.code, userId, claim.nonceHash, deps.hash)
        : await deps.provider.exchangeAndVerify({
            code: args.code,
            codeVerifier: claim.codeVerifier,
            expectedNonceHash: claim.nonceHash,
            ...deps.getRealConfiguration(),
          });
    const result = await deps.runner.finalizeRequest({
      requestId: claim.requestId,
      userId,
      lineUserId: identity.lineUserId,
      nonceHash: identity.nonceHash,
    });
    return getLineLinkFeedback(result.ok ? "SUCCESS" : result.reason);
  } catch (error) {
    const reasonCode = error instanceof LineProviderError ? error.reasonCode : "FAILED";
    await deps.runner.recordFailedRequest(claim.requestId, userId, reasonCode);
    return getLineLinkFeedback(reasonCode);
  }
}

function resolveMockIdentity(
  code: string,
  userId: string,
  nonceHash: string,
  hash: (value: string) => string,
) {
  if (code !== "mock") throw new LineProviderError("INVALID_CALLBACK");
  return { lineUserId: `mock-${hash(userId)}`, nonceHash };
}
