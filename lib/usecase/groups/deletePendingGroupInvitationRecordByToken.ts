/**
 * pending 招待レコード削除ユースケース（internalMutation）。
 * pending かつ Clerk 招待でないレコードのみ削除し、削除した ID を返す。
 */
import type { GroupInvitationRepository } from "../../domain/groups/groupInvitationRepository";

export async function deletePendingGroupInvitationRecordByToken(
  deps: { invitations: GroupInvitationRepository },
  args: { token: string },
): Promise<string | null> {
  const existing = await deps.invitations.findByToken(args.token);

  if (existing === null || existing.status !== "pending" || existing.clerkInvitationId) {
    return null;
  }

  await deps.invitations.delete(existing.id);
  return existing.id;
}
