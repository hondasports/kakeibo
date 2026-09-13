/**
 * GroupInvitationCleanupService の Convex 実装。
 * 実際の掃除ワークフローは既存の invitationHandlers へ委譲する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import { revokePendingGroupInvitationsForEmailInGroup } from "./invitationHandlers/revoke";
import { revokeGroupInvitationsForEmailInGroup } from "./invitationHandlers/staleCleanup";

export function createGroupInvitationCleanupService(
  ctx: MutationCtx,
): GroupInvitationCleanupService {
  return {
    async revokeForEmail(groupId, email) {
      await revokeGroupInvitationsForEmailInGroup(ctx, groupId as Id<"groups">, email);
    },
    async revokePendingForEmail(groupId, email) {
      return await revokePendingGroupInvitationsForEmailInGroup(
        ctx,
        groupId as Id<"groups">,
        email,
      );
    },
  };
}
