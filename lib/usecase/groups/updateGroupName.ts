/**
 * グループ名更新ユースケース。
 * active group の名前を更新する（オーナーのみ。権限確認は presentation 層で解決済み）。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { assertGroupNotDeletedOrThrow, normalizeGroupNameOrThrow } from "./validation";

export async function updateGroupName(
  ctx: UsecaseGroupContext,
  deps: Pick<GroupMutationDeps, "groups" | "auditLog">,
  args: { name: string },
): Promise<string> {
  const name = normalizeGroupNameOrThrow(args.name);

  const group = await deps.groups.get(ctx.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }
  assertGroupNotDeletedOrThrow(group);

  const previousName = group.name;
  if (previousName === name) {
    return ctx.groupId;
  }

  await deps.groups.patch(ctx.groupId, {
    name,
    updatedAt: Date.now(),
  });

  await deps.auditLog.record({
    groupId: ctx.groupId,
    actorUserId: ctx.userId,
    action: "group_name_changed",
    targetKind: "group",
    targetId: ctx.groupId,
    targetLabel: previousName,
    beforeValue: previousName,
    afterValue: name,
  });

  return ctx.groupId;
}
