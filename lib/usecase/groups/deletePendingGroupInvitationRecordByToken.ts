/**
 * pending 招待レコード削除ユースケース（internalMutation）。
 * pending の予約、または補償対象の Clerk ID と一致するレコードを削除する。
 */
import type { GroupInvitationRepository } from "../../domain/groups/groupInvitationRepository";

export async function deletePendingGroupInvitationRecordByToken(
  deps: { invitations: GroupInvitationRepository },
  args: { token: string; clerkInvitationId?: string },
): Promise<string | null> {
  const existing = await deps.invitations.findByToken(args.token);

  if (
    existing === null ||
    existing.status !== "pending" ||
    (existing.clerkInvitationId && existing.clerkInvitationId !== args.clerkInvitationId)
  ) {
    return null;
  }

  await deps.invitations.delete(existing.id);
  return existing.id;
}
