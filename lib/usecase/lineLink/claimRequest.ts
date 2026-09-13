import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { ClaimedLineLinkRequest } from "../../domain/lineLink/actionRunner";
import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";
import { planClaimRequest } from "../../domain/lineLink/rules";

export async function claimLineLinkRequest(
  deps: { requests: LineLinkRequestStore; audits: LineLinkAuditLogStore },
  args: { stateHash: string; userId: string },
  now = Date.now(),
): Promise<ClaimedLineLinkRequest> {
  const request = await deps.requests.findByStateHash(args.stateHash);
  const plan = planClaimRequest(request, args.userId, now);
  if (plan.kind === "invalid") return { ok: false, reason: "INVALID_CALLBACK" };
  if (plan.kind === "expired") {
    if (!request) return { ok: false, reason: "INVALID_CALLBACK" };
    await deps.requests.patch(request.id, { status: "expired", codeVerifier: "", updatedAt: now });
    await deps.audits.insert({
      userId: args.userId,
      action: "failed",
      result: "failure",
      reasonCode: "STATE_EXPIRED",
      createdAt: now,
    });
    return { ok: false, reason: "STATE_EXPIRED" };
  }

  await deps.requests.patch(plan.requestId, { status: "claimed", claimedAt: now, updatedAt: now });
  return {
    ok: true,
    requestId: plan.requestId,
    nonceHash: plan.nonceHash,
    codeVerifier: plan.codeVerifier,
  };
}
