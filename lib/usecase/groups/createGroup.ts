/**
 * グループ作成ユースケース。
 * グループとオーナーメンバーシップを作成し、作成者の activeGroupId を設定する。
 */
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { normalizeGroupNameOrThrow } from "./validation";

export async function createGroup(
  ctx: Pick<UsecaseGroupContext, "userId">,
  deps: Pick<GroupMutationDeps, "accountDeletion" | "groups" | "memberships" | "users">,
  args: { name: string },
): Promise<string> {
  await deps.accountDeletion.assertNotInProgress(ctx.userId);
  const name = normalizeGroupNameOrThrow(args.name);

  const now = Date.now();
  const groupId = await deps.groups.insert({
    name,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await deps.memberships.insert({
    groupId,
    userId: ctx.userId,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });

  const user = await deps.users.findByUserId(ctx.userId);
  if (user !== null) {
    await deps.users.setActiveGroup(user.docId, groupId, now);
  }

  return groupId;
}
