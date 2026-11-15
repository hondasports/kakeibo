import { resolveActiveLink } from "../../domain/lineLink/activeLink";
import type {
  LineAccountLinkReader,
  LineAccountLinkStore,
} from "../../domain/lineLink/accountLinkStore";
import type { LineLinkAuditLogStore } from "../../domain/lineLink/auditLogStore";

export async function getLineLinkStatus(
  accountLinks: LineAccountLinkReader,
  userId: string,
): Promise<
  { status: "unlinked" } | { status: "multiple" } | { status: "linked"; linkedAt: number }
> {
  const activeLink = resolveActiveLink(await accountLinks.listActiveByUserId(userId, 2));
  if (activeLink.kind === "multiple") return { status: "multiple" };
  // LINE userIdはクライアントへ返さない。
  return activeLink.kind === "single"
    ? { status: "linked", linkedAt: activeLink.link.linkedAt }
    : { status: "unlinked" };
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
