import type {
  LineAccountLinkReader,
  LineAccountLinkStore,
} from "../../domain/lineLink/accountLinkStore";
import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";

export async function getLineLinkStatus(
  accountLinks: LineAccountLinkReader,
  userId: string,
): Promise<{ status: "unlinked" } | { status: "linked"; linkedAt: number }> {
  const activeLink = await accountLinks.findLatestActiveByUserId(userId);
  // LINE userIdはクライアントへ返さない。
  return activeLink ? { status: "linked", linkedAt: activeLink.linkedAt } : { status: "unlinked" };
}

export async function unlinkLineAccount(
  deps: { accountLinks: LineAccountLinkStore; audits: LineLinkAuditLogStore },
  userId: string,
  now = Date.now(),
): Promise<{ status: "unlinked" }> {
  const activeLinks = await deps.accountLinks.listActiveByUserId(userId);
  if (activeLinks.length === 0) return { status: "unlinked" };
  for (const activeLink of activeLinks) {
    await deps.accountLinks.patch(activeLink.id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
  }
  await deps.audits.insert({
    userId,
    action: "unlinked",
    result: "success",
    createdAt: now,
  });
  return { status: "unlinked" };
}
