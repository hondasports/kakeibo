/**
 * systemAdmin 検索・詳細参照ユースケース（internalMutation 群の実体）。
 * 検索語の正規化・監査記録（クエリハッシュ）・DETAIL_LIST_LIMIT+1 打ち切りを維持する。
 */
import { ConvexError } from "convex/values";
import {
  DETAIL_LIST_LIMIT,
  groupAuditQueryType,
  hashSearchQuery,
  isValidSearchPageSize,
  normalizeSearchQuery,
  resolveSystemAdminSearchEnvironment,
  userAuditQueryType,
  type GroupSearchType,
  type SearchAuditQueryType,
  type SystemAdminEnvironment,
  type UserSearchType,
} from "../../domain/systemAdmin/searchQuery";
import type { PaginatedResult, PaginationOpts } from "../../domain/pagination";
import type { GroupUserRecord } from "../../domain/groups/groupUser";
import type { GroupRecord } from "../../domain/groups/group";
import type { SystemAdminMutationDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

function getSystemAdminEnvironment(): SystemAdminEnvironment {
  const result = resolveSystemAdminSearchEnvironment(process.env.APP_ENV);
  if (!result.success) throw new ConvexError("APP_ENVが正しく設定されていません");
  return result.environment;
}

function validatePagination(numItems: number) {
  if (!isValidSearchPageSize(numItems)) {
    throw new ConvexError("ページ件数は1〜100件で指定してください");
  }
}

function normalizeQueryOrThrow(query: string) {
  const { value, tooLong } = normalizeSearchQuery(query);
  if (tooLong) throw new ConvexError("検索語は200文字以内で入力してください");
  return value;
}

function mapUser(user: GroupUserRecord) {
  return {
    id: user.docId,
    userId: user.userId,
    displayName: user.displayName,
    email: user.email ?? null,
    activeGroupId: user.activeGroupId ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function mapGroup(group: GroupRecord) {
  return {
    id: group.id,
    name: group.name,
    status: group.status ?? "active",
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

type SearchDeps = Pick<
  SystemAdminMutationDeps,
  "admins" | "users" | "search" | "auditLogs" | "groups"
>;

type SearchAuditAction =
  | "system_admin_user_searched"
  | "system_admin_group_searched"
  | "system_admin_user_viewed"
  | "system_admin_group_viewed";

async function insertSearchAudit(
  deps: Pick<SearchDeps, "auditLogs">,
  args: {
    action: SearchAuditAction;
    actorUserId: string;
    targetKind: "user" | "group";
    targetId?: string;
    queryType?: SearchAuditQueryType;
    queryHash?: string;
    resultCount?: number;
  },
) {
  await deps.auditLogs.insert({
    action: args.action,
    actorType: "system_admin",
    actorUserId: args.actorUserId,
    targetKind: args.targetKind,
    ...(args.targetKind === "user" && args.targetId ? { targetUserId: args.targetId } : {}),
    ...(args.targetId ? { targetId: args.targetId } : {}),
    ...(args.queryType ? { queryType: args.queryType } : {}),
    ...(args.queryHash ? { queryHash: args.queryHash } : {}),
    ...(args.resultCount !== undefined ? { resultCount: args.resultCount } : {}),
    createdAt: Date.now(),
  });
}

function toPageShape<T, R>(page: PaginatedResult<T>, map: (item: T) => R) {
  return { continueCursor: page.continueCursor, isDone: page.isDone, page: page.page.map(map) };
}

export async function searchUsersData(
  deps: SearchDeps,
  args: {
    tokenIdentifier: string;
    queryType: UserSearchType;
    query: string;
    paginationOpts: PaginationOpts;
  },
) {
  const { user } = await requireSystemAdminActor(deps, args.tokenIdentifier);
  validatePagination(args.paginationOpts.numItems);
  const searchQuery = normalizeQueryOrThrow(args.query);
  const result =
    searchQuery.length === 0
      ? await deps.search.paginateUsersByCreatedAt(args.paginationOpts)
      : args.queryType === "displayName"
        ? await deps.search.searchUsersByDisplayName(searchQuery, args.paginationOpts)
        : args.queryType === "email"
          ? await deps.search.searchUsersByEmail(searchQuery.toLowerCase(), args.paginationOpts)
          : await deps.search.paginateUsersByUserId(searchQuery, args.paginationOpts);
  const response = {
    environment: getSystemAdminEnvironment(),
    ...toPageShape(result, mapUser),
  };
  await insertSearchAudit(deps, {
    action: "system_admin_user_searched",
    actorUserId: user.docId,
    targetKind: "user",
    queryType: userAuditQueryType(args.queryType),
    queryHash: await hashSearchQuery(args.query),
    resultCount: response.page.length,
  });
  return response;
}

export async function searchGroupsData(
  deps: SearchDeps,
  args: {
    tokenIdentifier: string;
    queryType: GroupSearchType;
    query: string;
    paginationOpts: PaginationOpts;
  },
) {
  const { user } = await requireSystemAdminActor(deps, args.tokenIdentifier);
  validatePagination(args.paginationOpts.numItems);
  const searchQuery = normalizeQueryOrThrow(args.query);
  if (searchQuery.length === 0) {
    const result = await deps.search.paginateGroupsByCreatedAt(args.paginationOpts);
    const response = {
      environment: getSystemAdminEnvironment(),
      ...toPageShape(result, mapGroup),
    };
    await insertSearchAudit(deps, {
      action: "system_admin_group_searched",
      actorUserId: user.docId,
      targetKind: "group",
      queryType: groupAuditQueryType(args.queryType),
      queryHash: await hashSearchQuery(args.query),
      resultCount: response.page.length,
    });
    return response;
  }
  if (args.queryType === "groupId") {
    const group = await deps.search.getGroupByIdString(searchQuery);
    const response = {
      environment: getSystemAdminEnvironment(),
      page: args.paginationOpts.cursor === null && group !== null ? [mapGroup(group)] : [],
      isDone: true,
      continueCursor: args.paginationOpts.cursor ?? "",
    };
    await insertSearchAudit(deps, {
      action: "system_admin_group_searched",
      actorUserId: user.docId,
      targetKind: "group",
      queryType: groupAuditQueryType(args.queryType),
      queryHash: await hashSearchQuery(args.query),
      resultCount: response.page.length,
    });
    return response;
  }
  const result = await deps.search.searchGroupsByName(searchQuery, args.paginationOpts);
  const response = {
    environment: getSystemAdminEnvironment(),
    ...toPageShape(result, mapGroup),
  };
  await insertSearchAudit(deps, {
    action: "system_admin_group_searched",
    actorUserId: user.docId,
    targetKind: "group",
    queryType: groupAuditQueryType(args.queryType),
    queryHash: await hashSearchQuery(args.query),
    resultCount: response.page.length,
  });
  return response;
}

export async function getUserDetailData(
  deps: SearchDeps,
  args: { tokenIdentifier: string; userId: string },
) {
  const { user: actorUser } = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const user = await deps.search.getUserByDocId(args.userId);
  if (user === null) {
    await insertSearchAudit(deps, {
      action: "system_admin_user_viewed",
      actorUserId: actorUser.docId,
      targetKind: "user",
      targetId: args.userId,
      resultCount: 0,
    });
    return null;
  }
  const membershipRows = await deps.search.takeMembershipsByUser(
    user.userId,
    DETAIL_LIST_LIMIT + 1,
  );
  const invitationRows = user.email
    ? await deps.search.takeInvitationsByEmail(user.email, DETAIL_LIST_LIMIT + 1)
    : [];
  const memberships = (
    await Promise.all(
      membershipRows.slice(0, DETAIL_LIST_LIMIT).map(async (membership) => {
        const group = await deps.groups.get(membership.groupId);
        return group
          ? {
              groupId: group.id,
              groupName: group.name,
              role: membership.role,
              createdAt: membership.createdAt,
              updatedAt: membership.updatedAt,
            }
          : null;
      }),
    )
  ).filter((membership): membership is NonNullable<typeof membership> => membership !== null);
  const invitations = (
    await Promise.all(
      invitationRows.slice(0, DETAIL_LIST_LIMIT).map(async (invitation) => {
        const group = await deps.groups.get(invitation.groupId);
        return group
          ? {
              id: invitation.id,
              groupId: group.id,
              groupName: group.name,
              status: invitation.status,
              createdAt: invitation.createdAt,
              updatedAt: invitation.updatedAt,
            }
          : null;
      }),
    )
  ).filter((invitation): invitation is NonNullable<typeof invitation> => invitation !== null);
  const response = {
    ...mapUser(user),
    environment: getSystemAdminEnvironment(),
    memberships,
    invitations,
    membershipsTruncated: membershipRows.length > DETAIL_LIST_LIMIT,
    invitationsTruncated: invitationRows.length > DETAIL_LIST_LIMIT,
  };
  await insertSearchAudit(deps, {
    action: "system_admin_user_viewed",
    actorUserId: actorUser.docId,
    targetKind: "user",
    targetId: args.userId,
    resultCount: 1,
  });
  return response;
}

export async function getGroupDetailData(
  deps: SearchDeps,
  args: { tokenIdentifier: string; groupId: string },
) {
  const { user: actorUser } = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const group = await deps.groups.get(args.groupId);
  if (group === null) {
    await insertSearchAudit(deps, {
      action: "system_admin_group_viewed",
      actorUserId: actorUser.docId,
      targetKind: "group",
      targetId: args.groupId,
      resultCount: 0,
    });
    return null;
  }
  const memberRows = await deps.search.takeMembershipsByGroup(args.groupId, DETAIL_LIST_LIMIT + 1);
  const invitationRows = await deps.search.takeInvitationsByGroup(
    args.groupId,
    DETAIL_LIST_LIMIT + 1,
  );
  const members = await Promise.all(
    memberRows.slice(0, DETAIL_LIST_LIMIT).map(async (membership) => {
      const user = await deps.search.findUserByUserId(membership.userId);
      return {
        userDocumentId: user?.docId ?? null,
        userId: membership.userId,
        displayName: user?.displayName ?? null,
        email: user?.email ?? null,
        role: membership.role,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      };
    }),
  );
  const response = {
    ...mapGroup(group),
    environment: getSystemAdminEnvironment(),
    members,
    invitations: invitationRows.slice(0, DETAIL_LIST_LIMIT).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
    })),
    membersTruncated: memberRows.length > DETAIL_LIST_LIMIT,
    invitationsTruncated: invitationRows.length > DETAIL_LIST_LIMIT,
  };
  await insertSearchAudit(deps, {
    action: "system_admin_group_viewed",
    actorUserId: actorUser.docId,
    targetKind: "group",
    targetId: args.groupId,
    resultCount: 1,
  });
  return response;
}
