import { paginationResultValidator, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { createSystemAdminMutationDeps } from "../lib/convex/systemAdmin/systemAdminDeps";
import {
  getGroupDetailData as getGroupDetailDataUsecase,
  getUserDetailData as getUserDetailDataUsecase,
  searchGroupsData as searchGroupsDataUsecase,
  searchUsersData as searchUsersDataUsecase,
} from "../lib/usecase/systemAdmin";

const systemAdminEnvironmentValidator = v.union(
  v.literal("development"),
  v.literal("preview"),
  v.literal("production"),
);
const userSearchTypeValidator = v.union(
  v.literal("displayName"),
  v.literal("email"),
  v.literal("userId"),
);
const groupQueryTypeValidator = v.union(v.literal("name"), v.literal("groupId"));

const userListItemValidator = v.object({
  id: v.id("users"),
  userId: v.string(),
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  activeGroupId: v.union(v.id("groups"), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const groupListItemValidator = v.object({
  id: v.id("groups"),
  name: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("deleting"),
    v.literal("deleted"),
    v.literal("archived"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const userSearchResultValidator = v.object({
  environment: systemAdminEnvironmentValidator,
  ...paginationResultValidator(userListItemValidator).fields,
});
const groupSearchResultValidator = v.object({
  environment: systemAdminEnvironmentValidator,
  ...paginationResultValidator(groupListItemValidator).fields,
});
const userMembershipValidator = v.object({
  groupId: v.id("groups"),
  groupName: v.string(),
  role: v.union(v.literal("owner"), v.literal("member")),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const userInvitationValidator = v.object({
  id: v.id("groupInvitations"),
  groupId: v.id("groups"),
  groupName: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("revoked"),
    v.literal("expired"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const userDetailValidator = v.object({
  ...userListItemValidator.fields,
  environment: systemAdminEnvironmentValidator,
  memberships: v.array(userMembershipValidator),
  invitations: v.array(userInvitationValidator),
  membershipsTruncated: v.boolean(),
  invitationsTruncated: v.boolean(),
});
const groupMemberValidator = v.object({
  userDocumentId: v.union(v.id("users"), v.null()),
  userId: v.string(),
  displayName: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: v.union(v.literal("owner"), v.literal("member")),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const groupInvitationValidator = v.object({
  id: v.id("groupInvitations"),
  email: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("revoked"),
    v.literal("expired"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
});
const groupDetailValidator = v.object({
  ...groupListItemValidator.fields,
  environment: systemAdminEnvironmentValidator,
  members: v.array(groupMemberValidator),
  invitations: v.array(groupInvitationValidator),
  membersTruncated: v.boolean(),
  invitationsTruncated: v.boolean(),
});

type UserSearchResult = Infer<typeof userSearchResultValidator>;
type GroupSearchResult = Infer<typeof groupSearchResultValidator>;
type UserDetail = Infer<typeof userDetailValidator>;
type GroupDetail = Infer<typeof groupDetailValidator>;

export const searchUsersData = internalMutation({
  args: {
    queryType: userSearchTypeValidator,
    query: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: userSearchResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await searchUsersDataUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      ...args,
    })) as UserSearchResult;
  },
});

export const searchGroupsData = internalMutation({
  args: {
    queryType: groupQueryTypeValidator,
    query: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: groupSearchResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await searchGroupsDataUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      ...args,
    })) as GroupSearchResult;
  },
});

export const getUserDetailData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(userDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await getUserDetailDataUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      userId: args.userId,
    })) as UserDetail | null;
  },
});

export const getGroupDetailData = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.union(groupDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return (await getGroupDetailDataUsecase(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      groupId: args.groupId,
    })) as GroupDetail | null;
  },
});

export const searchUsers = action({
  args: {
    queryType: userSearchTypeValidator,
    query: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: userSearchResultValidator,
  handler: async (ctx, args): Promise<UserSearchResult> => {
    const result: UserSearchResult = await ctx.runMutation(
      internal.systemAdminSearch.searchUsersData,
      args,
    );
    return result;
  },
});

export const searchGroups = action({
  args: {
    queryType: groupQueryTypeValidator,
    query: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: groupSearchResultValidator,
  handler: async (ctx, args): Promise<GroupSearchResult> => {
    const result: GroupSearchResult = await ctx.runMutation(
      internal.systemAdminSearch.searchGroupsData,
      args,
    );
    return result;
  },
});

export const getUserDetail = action({
  args: { userId: v.id("users") },
  returns: v.union(userDetailValidator, v.null()),
  handler: async (ctx, args): Promise<UserDetail | null> => {
    const result: UserDetail | null = await ctx.runMutation(
      internal.systemAdminSearch.getUserDetailData,
      args,
    );
    return result;
  },
});

export const getGroupDetail = action({
  args: { groupId: v.id("groups") },
  returns: v.union(groupDetailValidator, v.null()),
  handler: async (ctx, args): Promise<GroupDetail | null> => {
    const result: GroupDetail | null = await ctx.runMutation(
      internal.systemAdminSearch.getGroupDetailData,
      args,
    );
    return result;
  },
});
