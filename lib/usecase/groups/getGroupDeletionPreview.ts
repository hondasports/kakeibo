/**
 * グループ削除プレビューユースケース（query。オーナーのみ。権限確認は presentation 層で解決済み）。
 * 未削除を確認した上で、関連データの影響件数を返す。
 */
import { ConvexError } from "convex/values";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type {
  GroupDeletionImpactCounts,
  GroupDeletionWorkflowService,
} from "../../domain/groupDeletion/groupDeletionWorkflow";
import type { UsecaseGroupContext } from "../context";
import { assertGroupNotDeletedOrThrow } from "./validation";

export async function getGroupDeletionPreview(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    groups: GroupReadRepository;
    deletionQuery: Pick<GroupDeletionWorkflowService, "countImpact">;
  },
): Promise<{ groupName: string } & GroupDeletionImpactCounts> {
  const group = await deps.groups.get(ctx.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }
  assertGroupNotDeletedOrThrow(group);

  const counts = await deps.deletionQuery.countImpact(ctx.groupId);

  return {
    groupName: group.name,
    ...counts,
  };
}
