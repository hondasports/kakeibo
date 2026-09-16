/**
 * pending 招待取り消しユースケース（mutation。オーナーのみ。権限確認は presentation 層で解決済み）。
 * active group スコープ確認後に pending 招待を revoke し、対象の Clerk 招待 ID を返す。
 */
import { ConvexError } from "convex/values";
import { getGroupAdminErrorMessage, validateActiveGroupScope } from "../../domain/groups/admin";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";

export async function cancelPendingGroupInvitation(
  ctx: UsecaseGroupContext,
  deps: Pick<GroupMutationDeps, "invitations" | "invitationCleanup" | "auditLog">,
  args: { invitationId: string },
): Promise<{ clerkInvitationIds: string[] }> {
  const invitation = await deps.invitations.findById(args.invitationId);

  if (invitation === null) {
    throw new ConvexError("招待が見つかりません");
  }

  const scopeCheck = validateActiveGroupScope(ctx.groupId, invitation.groupId);
  if (!scopeCheck.success) {
    throw new ConvexError(getGroupAdminErrorMessage(scopeCheck.error));
  }

  if (invitation.status !== "pending") {
    throw new ConvexError("この招待は取り消せません");
  }

  const clerkInvitationIds = await deps.invitationCleanup.revokePendingForEmail(
    ctx.groupId,
    invitation.email,
  );

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "invitation_revoked",
    targetKind: "invitation",
    targetId: invitation.id,
    targetLabel: invitation.email,
  });

  return { clerkInvitationIds };
}
