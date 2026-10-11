/**
 * owner として保持できるグループ数の上限を検証する共通ヘルパー。
 * owner になる全ての遷移（グループ作成・ロール昇格・オーナー譲渡）が同じ不変条件を共有する。
 * 上限は owner が Clerk 招待メールを送れることへの濫用対策。
 */
import { ConvexError } from "convex/values";
import { MAX_OWNED_GROUPS_PER_USER } from "../../domain/groups/groupInvitation";
import type { GroupMembershipRepository } from "../../domain/groups/groupMembershipRepository";

/** 走査は 100 件までの bounded read。owner 数は上限に達した時点で拒否するため、それで十分。 */
export const OWNED_GROUPS_SCAN_LIMIT = 100;

/** 作成者本人に向けた上限超過メッセージ。 */
export const OWNED_GROUP_LIMIT_SELF_MESSAGE = `作成できるグループは${MAX_OWNED_GROUPS_PER_USER}個までです。不要なグループを削除してから再度お試しください`;

/** 他ユーザーをオーナーにする操作（昇格・譲渡）向けの上限超過メッセージ。 */
export const OWNED_GROUP_LIMIT_TARGET_MESSAGE = `対象ユーザーが保持できるグループの上限（${MAX_OWNED_GROUPS_PER_USER}個）に達しているため、オーナーにできません`;

export async function assertOwnedGroupLimit(
  deps: { memberships: Pick<GroupMembershipRepository, "listByUser"> },
  userId: string,
  options: { subject: "self" | "target" },
): Promise<void> {
  const memberships = await deps.memberships.listByUser(userId, OWNED_GROUPS_SCAN_LIMIT);
  const ownedGroupCount = memberships.filter((membership) => membership.role === "owner").length;
  if (ownedGroupCount >= MAX_OWNED_GROUPS_PER_USER) {
    throw new ConvexError(
      options.subject === "self"
        ? OWNED_GROUP_LIMIT_SELF_MESSAGE
        : OWNED_GROUP_LIMIT_TARGET_MESSAGE,
    );
  }
}
