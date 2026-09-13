export type ClaimedLineLinkRequest =
  | { ok: false; reason: string }
  | { ok: true; requestId: string; nonceHash: string; codeVerifier: string };

export type FinalizeLineLinkResult = { ok: true } | { ok: false; reason: string };

export interface LineLinkActionRunner {
  expireRequests(now: number, limit: number): Promise<{ expiredCount: number }>;
  createRequest(args: {
    userId: string;
    stateHash: string;
    nonceHash: string;
    codeVerifier: string;
    expiresAt: number;
  }): Promise<string>;
  claimRequest(stateHash: string, userId: string): Promise<ClaimedLineLinkRequest>;
  finalizeRequest(args: {
    requestId: string;
    userId: string;
    lineUserId: string;
    nonceHash: string;
  }): Promise<FinalizeLineLinkResult>;
  recordFailedRequest(requestId: string, userId: string, reasonCode: string): Promise<void>;
}
