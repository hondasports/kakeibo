/**
 * GroupDeletionWorkflowService / GroupDeletionJobReader の Convex 実装。
 * オーケストレーションは groupDeletion ユースケースへ委譲する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { GroupDeletionWorkflowService } from "../../domain/groupDeletion/groupDeletionWorkflow";
import { countGroupDeletionImpact } from "../../usecase/groupDeletion/countGroupDeletionImpact";
import { resumeGroupDeletion } from "../../usecase/groupDeletion/resumeGroupDeletion";
import { startGroupDeletion } from "../../usecase/groupDeletion/startGroupDeletion";
import { createGroupDeletionMutationDeps, createGroupDeletionQueryDeps } from "./groupDeletionDeps";

export { createGroupDeletionJobReader } from "./convexGroupDeletionJobStore";

/** 読み取り専用コンテキスト（query）向けの影響件数集計。 */
export function createGroupDeletionQueryService(
  ctx: Pick<QueryCtx, "db">,
): Pick<GroupDeletionWorkflowService, "countImpact"> {
  return {
    async countImpact(groupId) {
      return await countGroupDeletionImpact(createGroupDeletionQueryDeps(ctx), groupId);
    },
  };
}

export function createGroupDeletionWorkflowService(ctx: MutationCtx): GroupDeletionWorkflowService {
  return {
    async start(args) {
      return await startGroupDeletion(createGroupDeletionMutationDeps(ctx), args);
    },
    async resume(args) {
      return await resumeGroupDeletion(createGroupDeletionMutationDeps(ctx), args);
    },
    async countImpact(groupId) {
      return await countGroupDeletionImpact(createGroupDeletionQueryDeps(ctx), groupId);
    },
  };
}
