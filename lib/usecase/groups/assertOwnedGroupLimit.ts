/**
 * owner として保持できるグループ数の上限を検証する共通ヘルパー。
 * グループ作成・グループ owner によるロール昇格・オーナー譲渡が同じ不変条件を共有する。
 * 上限は owner が Clerk 招待メールを送れることへの濫用対策。
 *
 * 適用対象外（意図的）: システム管理者のロール操作（lib/usecase/systemAdmin/roleOperation.ts の
 * change_role / transfer_owner）とオーナー不在グループの復旧（ownerlessRecovery.ts）。
 * これらは監査ログを残す特権操作のため、上限は課さない。
 */
import { ConvexError } from "convex/values";
import { MAX_OWNED_GROUPS_PER_USER } from "../../domain/groups/groupInvitation";
import type { GroupMembershipRepository } from "../../domain/groups/groupMembershipRepository";

/** 作成者本人に向けた上限超過メッセージ。 */
export const OWNED_GROUP_LIMIT_SELF_MESSAGE = `作成できるグループは${MAX_OWNED_GROUPS_PER_USER}個までです。不要なグループを削除してから再度お試しください`;

/** 他ユーザーをオーナーにする操作（昇格・譲渡）向けの上限超過メッセージ。 */
export const OWNED_GROUP_LIMIT_TARGET_MESSAGE = `対象ユーザーが保持できるグループの上限（${MAX_OWNED_GROUPS_PER_USER}個）に達しているため、オーナーにできません`;

export async function assertOwnedGroupLimit(
  deps: { memberships: Pick<GroupMembershipRepository, "listByUserAndRole"> },
  userId: string,
  options: { subject: "self" | "target" },
): Promise<void> {
  // (userId, role) インデックスで owner 行だけを読む。member 行の多寡に影響されず、
  // 上限に達したかの判定に必要な MAX_OWNED_GROUPS_PER_USER 件までの bounded read で済む。
  const ownedMemberships = await deps.memberships.listByUserAndRole(
    userId,
    "owner",
    MAX_OWNED_GROUPS_PER_USER,
  );
  if (ownedMemberships.length >= MAX_OWNED_GROUPS_PER_USER) {
    throw new ConvexError(
      options.subject === "self"
        ? OWNED_GROUP_LIMIT_SELF_MESSAGE
        : OWNED_GROUP_LIMIT_TARGET_MESSAGE,
    );
  }
}
