import type { LineAccountLinkStore } from "../../domain/lineLink/accountLinkStore";
import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { FinalizeLineLinkResult } from "../../domain/lineLink/actionRunner";
import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";
import { canFinalizeRequest, hasLineLinkConflict } from "../../domain/lineLink/rules";

export async function finalizeLineLinkRequest(
  deps: {
    requests: LineLinkRequestStore;
    accountLinks: LineAccountLinkStore;
    audits: LineLinkAuditLogStore;
  },
  args: { requestId: string; userId: string; lineUserId: string; nonceHash: string },
  now = Date.now(),
): Promise<FinalizeLineLinkResult> {
  const request = await deps.requests.getById(args.requestId);
  if (!canFinalizeRequest(request, args.userId, args.nonceHash, now)) {
    if (request?.userId === args.userId && request.status === "claimed") {
      await deps.requests.patch(request.id, { status: "failed", codeVerifier: "", updatedAt: now });
    }
    return { ok: false, reason: "INVALID_CALLBACK" };
  }

  const existingLineLinks = await deps.accountLinks.listActiveByLineUserId(args.lineUserId);
  if (hasLineLinkConflict(existingLineLinks, args.userId)) {
    await deps.requests.patch(args.requestId, {
      status: "failed",
      codeVerifier: "",
      updatedAt: now,
    });
    await deps.audits.insert({
      userId: args.userId,
      action: "failed",
      result: "failure",
      reasonCode: "LINE_LINK_CONFLICT",
      createdAt: now,
    });
    return { ok: false, reason: "LINE_LINK_CONFLICT" };
  }

  const existingUserLinks = await deps.accountLinks.listActiveByUserId(args.userId);
  const revokeTargetIds = new Set(
    [...existingUserLinks, ...existingLineLinks].map((link) => link.id),
  );
  for (const linkId of revokeTargetIds) {
    await deps.accountLinks.patch(linkId, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
  }

  await deps.accountLinks.insert({
    userId: args.userId,
    lineUserId: args.lineUserId,
    status: "active",
    linkedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await deps.requests.patch(args.requestId, {
    status: "completed",
    codeVerifier: "",
    completedAt: now,
    updatedAt: now,
  });
  await deps.audits.insert({
    userId: args.userId,
    action: "linked",
    result: "success",
    createdAt: now,
  });
  return { ok: true };
}
