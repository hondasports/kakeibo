import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { deleteAllGroupScopedData as runDeleteAllGroupScopedData } from "../../../lib/usecase/groupDeletion/deleteAllGroupScopedData";

/**
 * グループに紐づく Convex データをすべて物理削除する。
 * `users` と Clerk アカウントは削除しない。
 */
export async function deleteAllGroupScopedData(ctx: MutationCtx, groupId: Id<"groups">) {
  await runDeleteAllGroupScopedData(createGroupDeletionMutationDeps(ctx), groupId);
}
