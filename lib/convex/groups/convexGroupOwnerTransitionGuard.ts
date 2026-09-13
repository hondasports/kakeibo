/**
 * GroupOwnerTransitionGuard の Convex 実装。
 * 不変条件の検証は既存の adminGuards アサーションへ委譲する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { GroupOwnerTransitionGuard } from "../../domain/groups/groupServices";
import { assertAnotherGroupOwnerRemains } from "../../../convex/groups/adminGuards";

export function createGroupOwnerTransitionGuard(
  ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
): GroupOwnerTransitionGuard {
  return {
    async assertAnotherOwnerRemains(groupId, demotedMembershipId) {
      await assertAnotherGroupOwnerRemains(
        ctx,
        groupId as Id<"groups">,
        demotedMembershipId as Id<"groupMembers">,
      );
    },
  };
}
