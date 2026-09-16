/**
 * メールアドレス指定のメンバー追加ユースケース（オーナーのみ。権限確認は presentation 層で解決済み）。
 */
import { ConvexError } from "convex/values";
import type { UsecaseGroupContext } from "../context";
import type { GroupMutationDeps } from "./deps";
import { normalizeEmailOrThrow } from "./validation";

export async function addMemberByEmail(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: Pick<GroupMutationDeps, "users" | "accountDeletion" | "memberships">,
  args: { email: string },
): Promise<void> {
  const email = normalizeEmailOrThrow(args.email);
  const user = await deps.users.findByEmail(email);

  if (user === null) {
    throw new ConvexError("Clerkで招待済みのユーザーがログインした後に追加できます");
  }
  await deps.accountDeletion.assertNotInProgress(user.userId);

  const existingMembershipInGroup = await deps.memberships.findByGroupAndUser(
    ctx.groupId,
    user.userId,
  );

  if (existingMembershipInGroup !== null) {
    throw new ConvexError("このユーザーはすでにグループに参加しています");
  }

  const now = Date.now();
  await deps.memberships.insert({
    groupId: ctx.groupId,
    userId: user.userId,
    role: "member",
    createdAt: now,
    updatedAt: now,
  });

  if (!user.activeGroupId) {
    await deps.users.setActiveGroup(user.docId, ctx.groupId, now);
  }
}
