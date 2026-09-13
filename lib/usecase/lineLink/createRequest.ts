import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";

export async function createLineLinkRequest(
  deps: { requests: LineLinkRequestStore; audits: LineLinkAuditLogStore },
  args: {
    userId: string;
    stateHash: string;
    nonceHash: string;
    codeVerifier: string;
    expiresAt: number;
  },
  now = Date.now(),
): Promise<string> {
  const requestId = await deps.requests.insert({
    ...args,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  await deps.audits.insert({
    userId: args.userId,
    action: "started",
    result: "success",
    createdAt: now,
  });
  return requestId;
}
