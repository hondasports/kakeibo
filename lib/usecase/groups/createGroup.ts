/**
 * グループ作成ユースケース。
 * グループとオーナーメンバーシップを作成し、作成者の activeGroupId を設定する。
 */
import { ConvexError } from "convex/values";
import { MAX_OWNED_GROUPS_PER_USER } from "../../domain/groups/groupInvitation";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { normalizeGroupNameOrThrow } from "./validation";

const OWNED_GROUPS_SCAN_LIMIT = 100;

export async function createGroup(
  ctx: Pick<UsecaseGroupContext, "userId">,
  deps: Pick<GroupMutationDeps, "accountDeletion" | "groups" | "memberships" | "users">,
  args: { name: string },
): Promise<string> {
  await deps.accountDeletion.assertNotInProgress(ctx.userId);
  const name = normalizeGroupNameOrThrow(args.name);

  // owner として保持するグループ数を制限する（無制限のグループ作成→大量招待の踏み台を防ぐ）。
  // 走査は 100 件までの bounded read。owner 数は上限に達した時点で拒否するため、それで十分。
  const memberships = await deps.memberships.listByUser(ctx.userId, OWNED_GROUPS_SCAN_LIMIT);
  const ownedGroupCount = memberships.filter((membership) => membership.role === "owner").length;
  if (ownedGroupCount >= MAX_OWNED_GROUPS_PER_USER) {
    throw new ConvexError(
      `作成できるグループは${MAX_OWNED_GROUPS_PER_USER}個までです。不要なグループを削除してから再度お試しください`,
    );
  }

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
