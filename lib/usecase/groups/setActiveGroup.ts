/**
 * アクティブグループ切替ユースケース。
 * 所属・未削除・ユーザー存在を確認してから activeGroupId を更新する。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { assertGroupNotDeletedOrThrow } from "./validation";

export async function setActiveGroup(
  ctx: Pick<UsecaseGroupContext, "userId">,
  deps: Pick<GroupMutationDeps, "memberships" | "groups" | "users">,
  args: { groupId: string },
): Promise<string> {
  const membership = await deps.memberships.findByGroupAndUser(args.groupId, ctx.userId);
  if (membership === null) {
    throw new ConvexError("指定されたグループに所属していません");
  }

  const group = await deps.groups.get(args.groupId);
  if (group === null) {
    throw new ConvexError("グループが見つかりません");
  }
  assertGroupNotDeletedOrThrow(group);

  const user = await deps.users.findByUserId(ctx.userId);
  if (user === null) {
    throw new ConvexError("User not found");
  }

  await deps.users.setActiveGroup(user.docId, args.groupId, Date.now());

  return args.groupId;
}
