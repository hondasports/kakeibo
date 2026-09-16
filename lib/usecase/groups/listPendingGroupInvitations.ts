/**
 * pending 招待一覧取得ユースケース（query。オーナーのみ。権限確認は presentation 層で解決済み）。
 * メールアドレスで dedupe して返す。
 */
import type { GroupInvitationReadRepository } from "../../domain/groups/groupInvitationRepository";
import { dedupePendingInvitationsByEmail } from "../../domain/groups/email";
import type { UsecaseGroupContext } from "../context";

export type PendingGroupInvitationItem = {
  invitationId: string;
  email: string;
  status: "pending";
  createdAt: number;
};

export async function listPendingGroupInvitations(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: { invitations: GroupInvitationReadRepository },
): Promise<PendingGroupInvitationItem[]> {
  const invitations = await deps.invitations.listByGroupAndStatus(ctx.groupId, "pending");

  return dedupePendingInvitationsByEmail(
    invitations.map((invitation) => ({
      invitationId: invitation.id,
      email: invitation.email,
      status: "pending" as const,
      createdAt: invitation.createdAt,
    })),
  );
}
