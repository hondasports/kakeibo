import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { createGroupDeletionQueryDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { countGroupDeletionImpact as countImpact } from "../../../lib/usecase/groupDeletion/countGroupDeletionImpact";

export type {
  GroupDeletionImpactCounts,
  GroupDeletionPreviewCount,
} from "../../../lib/domain/groupDeletion/groupDeletionWorkflow";

export async function countGroupDeletionImpact(ctx: Pick<QueryCtx, "db">, groupId: Id<"groups">) {
  return await countImpact(createGroupDeletionQueryDeps(ctx), groupId);
}
