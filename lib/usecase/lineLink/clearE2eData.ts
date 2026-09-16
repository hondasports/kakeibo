import type { LineAccountLinkStore } from "../../domain/lineLink/accountLinkStore";
import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";
import type { LineLinkRequestStore } from "../../domain/lineLink/requestStore";

export async function clearLineLinkE2eDataForUser(
  deps: {
    accountLinks: LineAccountLinkStore;
    requests: LineLinkRequestStore;
    audits: LineLinkAuditLogStore;
  },
  userId: string,
): Promise<{ deletedCount: number; hasMore: boolean }> {
  const [links, requests, audits] = await Promise.all([
    deps.accountLinks.takeByUserId(userId, 100),
    deps.requests.takeByUserId(userId, 100),
    deps.audits.takeByUserId(userId, 100),
  ]);
  for (const record of links) await deps.accountLinks.deleteById(record.id);
  for (const record of requests) await deps.requests.deleteById(record.id);
  for (const record of audits) await deps.audits.deleteById(record.id);
  return {
    deletedCount: links.length + requests.length + audits.length,
    hasMore: links.length === 100 || requests.length === 100 || audits.length === 100,
  };
}
