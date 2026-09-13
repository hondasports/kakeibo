import type { LineLinkActionRunner } from "../../domain/lineLink/actionRunner";
import type { LineIntegrationMode } from "../../domain/lineLink/integrationMode";
import type { LineLinkScheduler } from "../../domain/lineLink/scheduler";

export const LINE_LINK_REQUEST_TTL_MS = 10 * 60 * 1000;

export type LineLoginConfiguration = {
  channelId: string;
  channelSecret: string;
  redirectUri: string;
};

export type StartLineLinkDeps = {
  runner: LineLinkActionRunner;
  scheduler: LineLinkScheduler;
  getMode(): LineIntegrationMode;
  getRealConfiguration(): LineLoginConfiguration;
  randomUrlSafeValue(): string;
  hash(value: string): string;
  now(): number;
};

export async function startLineLink(
  deps: StartLineLinkDeps,
  userId: string,
): Promise<{ authorizationUrl: string }> {
  let mode: LineIntegrationMode;
  try {
    mode = deps.getMode();
  } catch {
    throw new Error("LINE integration is unavailable");
  }
  const realConfiguration = mode === "real" ? deps.getRealConfiguration() : undefined;

  await deps.runner.expireRequests(deps.now(), 50);
  const state = deps.randomUrlSafeValue();
  const nonce = deps.randomUrlSafeValue();
  const codeVerifier = deps.randomUrlSafeValue();
  const requestId = await deps.runner.createRequest({
    userId,
    stateHash: deps.hash(state),
    nonceHash: deps.hash(nonce),
    codeVerifier,
    expiresAt: deps.now() + LINE_LINK_REQUEST_TTL_MS,
  });
  await deps.scheduler.scheduleRequestExpiration(LINE_LINK_REQUEST_TTL_MS + 1_000, requestId);

  if (mode === "mock") {
    return {
      authorizationUrl: `/settings/line/callback?state=${encodeURIComponent(state)}&code=mock`,
    };
  }
  if (!realConfiguration) throw new Error("LINE integration is unavailable");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: realConfiguration.channelId,
    redirect_uri: realConfiguration.redirectUri,
    scope: "openid",
    state,
    nonce,
    code_challenge: deps.hash(codeVerifier),
    code_challenge_method: "S256",
  });
  return { authorizationUrl: `https://access.line.me/oauth2/v2.1/authorize?${params}` };
}
