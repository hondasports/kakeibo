import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";

export async function recordFailedLineLinkRequest(
  deps: { requests: LineLinkRequestStore; audits: LineLinkAuditLogStore },
  args: { requestId: string; userId: string; reasonCode: string },
  now = Date.now(),
): Promise<void> {
  const request = await deps.requests.getById(args.requestId);
  if (!request || request.userId !== args.userId || request.status !== "claimed") return;
  await deps.requests.patch(request.id, { status: "failed", codeVerifier: "", updatedAt: now });
  await deps.audits.insert({
    userId: args.userId,
    action: "failed",
    result: "failure",
    reasonCode: args.reasonCode,
    createdAt: now,
  });
}
