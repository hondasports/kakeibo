import type { LineAccountLinkRecord, LineLinkRequestRecord } from "./records";

export type ClaimRequestPlan =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "claim"; requestId: string; nonceHash: string; codeVerifier: string };

export function planClaimRequest(
  request: LineLinkRequestRecord | null,
  userId: string,
  now: number,
): ClaimRequestPlan {
  if (!request || request.userId !== userId || request.status !== "pending") {
    return { kind: "invalid" };
  }
  if (request.expiresAt <= now) return { kind: "expired" };
  return {
    kind: "claim",
    requestId: request.id,
    nonceHash: request.nonceHash,
    codeVerifier: request.codeVerifier,
  };
}

export function canFinalizeRequest(
  request: LineLinkRequestRecord | null,
  userId: string,
  nonceHash: string,
  now: number,
): boolean {
  return Boolean(
    request &&
    request.userId === userId &&
    request.status === "claimed" &&
    request.expiresAt > now &&
    request.nonceHash === nonceHash,
  );
}

export function hasLineLinkConflict(activeLinks: LineAccountLinkRecord[], userId: string): boolean {
  return activeLinks.some((link) => link.userId !== userId);
}

export function clampExpirationLimit(limit: number): number {
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}
