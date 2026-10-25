/**
 * GroupInvitationCleanupService の Convex 実装。
 * 実際の掃除ワークフローは既存の invitationHandlers へ委譲する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import { revokePendingGroupInvitationsForEmailInGroup } from "./invitationHandlers/revoke";
import {
  assertGroupInvitationIssuedAfterLastRemoval,
  revokeGroupInvitationsForEmailInGroup,
} from "./invitationHandlers/staleCleanup";

export function createGroupInvitationEligibilityGuard(
  ctx: Pick<QueryCtx, "db">,
): Pick<GroupInvitationCleanupService, "assertIssuedAfterLastRemoval"> {
  return {
    async assertIssuedAfterLastRemoval(invitationId, userId) {
      await assertGroupInvitationIssuedAfterLastRemoval(
        ctx,
        invitationId as Id<"groupInvitations">,
        userId,
      );
    },
  };
}

export function createGroupInvitationCleanupService(
  ctx: MutationCtx,
): GroupInvitationCleanupService {
  return {
    ...createGroupInvitationEligibilityGuard(ctx),
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
