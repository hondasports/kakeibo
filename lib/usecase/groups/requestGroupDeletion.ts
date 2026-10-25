/**
 * グループ削除リクエストユースケース（mutation。オーナーのみ。権限確認は presentation 層で解決済み）。
 * 指定時の対象IDと確認名を検証して削除ジョブを開始し、要求者の activeGroupId を解除する。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { GROUP_ADMIN_ERROR_MESSAGES } from "./groupAdminErrors";
import { assertGroupNotDeletedOrThrow, normalizeGroupNameOrThrow } from "./validation";

export async function requestGroupDeletion(
  ctx: UsecaseGroupContext,
  deps: Pick<GroupMutationDeps, "groups" | "deletionWorkflow" | "users">,
  args: { confirmationGroupName: string; expectedGroupId?: string },
): Promise<string> {
  if (args.expectedGroupId !== undefined && args.expectedGroupId !== ctx.groupId) {
    throw new ConvexError("削除対象のグループが変わりました。内容を再確認してください。");
  }
  const group = await deps.groups.get(ctx.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }
  assertGroupNotDeletedOrThrow(group);

  const confirmationGroupName = normalizeGroupNameOrThrow(args.confirmationGroupName);
  if (confirmationGroupName !== group.name) {
    throw new ConvexError(GROUP_ADMIN_ERROR_MESSAGES.GROUP_NAME_MISMATCH);
  }

  const jobId = await deps.deletionWorkflow.start({
    groupId: ctx.groupId,
    source: "owner",
    actorUserIdSnapshot: ctx.userId,
  });
  const requester = await deps.users.findByUserId(ctx.userId);
  if (requester?.activeGroupId === ctx.groupId) {
    await deps.users.setActiveGroup(requester.docId, undefined, Date.now());
  }
  return jobId;
}
