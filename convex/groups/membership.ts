import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertGroupOwnerRole } from "./adminGuards";
import { isGroupDeleted } from "./lib/groupLifecycle";
import type { GroupMembership } from "./lib/groupTypes";
import { requireAuthenticatedUserId } from "../users/auth";
import { resolveActiveMembership } from "../../lib/domain/groups/membershipResolution";
import { createGroupReadRepository } from "../../lib/convex/groups/convexGroupRepository";
import { createGroupMembershipReadRepository } from "../../lib/convex/groups/convexGroupMembershipRepository";
import { createUserDirectoryRead } from "../../lib/convex/groups/convexUserDirectory";

export type { GroupMembership } from "./lib/groupTypes";

export { MAX_GROUP_NAME_LENGTH, normalizeGroupName } from "./lib/groupName";

export type ActiveGroupResolution =
  | { status: "resolved"; membership: GroupMembership }
  | { status: "no_group" }
  | { status: "unresolved" };

function createMembershipKernelDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    users: createUserDirectoryRead(ctx),
  };
}

/**
 * Clerk認証を使わず、既に解決済みのuserIdからactiveグループを決める。
 * LINE Webhookなど、外部連携から内部的に呼ぶためのヘルパー。
 */
export async function resolveActiveGroupForUserId(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
): Promise<ActiveGroupResolution> {
  const deps = createMembershipKernelDeps(ctx);
  const memberships = await deps.memberships.listByUser(userId);

  const activeMemberships: typeof memberships = [];
  for (const membership of memberships) {
    const group = await deps.groups.get(membership.groupId);
    if (group !== null && isGroupDeleted(group)) {
      continue;
    }
    activeMemberships.push(membership);
  }

  if (activeMemberships.length === 0) {
    return { status: "no_group" };
  }

  const user = await deps.users.findByUserId(userId);
  const activeMembership = resolveActiveMembership(activeMemberships, user?.activeGroupId);
  if (activeMembership === null) {
    return { status: "unresolved" };
  }

  return {
    status: "resolved",
    membership: {
      membershipId: activeMembership.id as Id<"groupMembers">,
      groupId: activeMembership.groupId as Id<"groups">,
      userId,
      role: activeMembership.role,
    },
  };
}

/**
 * 認証済みユーザーのグループメンバーシップを取得する。
 * データファイルから共通利用するため export する。
 */
export async function getGroupMembership(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<GroupMembership | null> {
  const userId = await requireAuthenticatedUserId(ctx);
  const resolved = await resolveActiveGroupForUserId(ctx, userId);
  return resolved.status === "resolved" ? resolved.membership : null;
}

async function getAllGroupMemberships(ctx: Pick<QueryCtx, "auth" | "db">) {
  const userId = await requireAuthenticatedUserId(ctx);
  return await createGroupMembershipReadRepository(ctx).listByUser(userId);
}

async function getCurrentUserActiveGroupId(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<string | null> {
  const userId = await requireAuthenticatedUserId(ctx);
  const user = await createUserDirectoryRead(ctx).findByUserId(userId);
  return user?.activeGroupId ?? null;
}

export async function getResolvedMemberships(ctx: Pick<QueryCtx, "auth" | "db">) {
  const memberships = await getAllGroupMemberships(ctx);
  const activeGroupId = await getCurrentUserActiveGroupId(ctx);
  const deps = createMembershipKernelDeps(ctx);

  const activeMemberships: typeof memberships = [];
  for (const membership of memberships) {
    const group = await deps.groups.get(membership.groupId);
    if (group === null || isGroupDeleted(group)) {
      continue;
    }
    activeMemberships.push(membership);
  }

  const activeMembership = resolveActiveMembership(activeMemberships, activeGroupId);

  return { memberships: activeMemberships, activeMembership };
}

export async function findNextActiveGroupIdForUser(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  excludedGroupId: Id<"groups">,
): Promise<Id<"groups"> | undefined> {
  const deps = createMembershipKernelDeps(ctx);
  const memberships = await deps.memberships.listByUser(userId);

  for (const membership of memberships) {
    if ((membership.groupId as Id<"groups">) === excludedGroupId) {
      continue;
    }
    const group = await deps.groups.get(membership.groupId);
    if (group !== null && !isGroupDeleted(group)) {
      return membership.groupId as Id<"groups">;
    }
  }

  return undefined;
}

/**
 * 認証済みユーザーのグループメンバーシップを取得する。
 * グループ未所属の場合は ConvexError を throw する。
 */
export async function requireGroupMembership(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<GroupMembership> {
  const membership = await getGroupMembership(ctx);
  if (membership === null) {
    throw new ConvexError("グループに所属していません");
  }
  return membership;
}

/**
 * active group のオーナー権限を要求する。
 * 管理系 mutation はこのヘルパーまたは groupAdminGuards の assertion を使う。
 */
export async function requireGroupOwner(
  ctx: Pick<QueryCtx, "auth" | "db">,
): Promise<GroupMembership> {
  const membership = await requireGroupMembership(ctx);
  assertGroupOwnerRole(membership.role);
  return membership;
}
