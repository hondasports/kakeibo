/**
 * SystemAdminSearchStore の Convex 実装。
 * 検索インデックス・created_at ページネーション・normalizeId の知識はここに閉じ込める。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { GroupUserRecord } from "../../domain/groups/groupUser";
import type { GroupRecord } from "../../domain/groups/group";
import type { GroupMemberRecord } from "../../domain/groups/groupMember";
import type { GroupInvitationRecord } from "../../domain/groups/groupInvitation";
import type { SystemAdminSearchStore } from "../../domain/systemAdmin/searchStore";

function userDocToRecord(doc: Doc<"users">): GroupUserRecord {
  return {
    docId: doc._id,
    userId: doc.userId,
    displayName: doc.displayName,
    email: doc.email,
    activeGroupId: doc.activeGroupId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function groupDocToRecord(doc: Doc<"groups">): GroupRecord {
  return {
    id: doc._id,
    name: doc.name,
    clerkOrganizationId: doc.clerkOrganizationId,
    status: doc.status,
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function memberDocToRecord(doc: Doc<"groupMembers">): GroupMemberRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    userId: doc.userId,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function invitationDocToRecord(doc: Doc<"groupInvitations">): GroupInvitationRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    email: doc.email,
    token: doc.token,
    status: doc.status,
    invitedByUserId: doc.invitedByUserId,
    clerkInvitationId: doc.clerkInvitationId,
    acceptedByUserId: doc.acceptedByUserId,
    acceptedAt: doc.acceptedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createSystemAdminSearchStore(ctx: Pick<MutationCtx, "db">): SystemAdminSearchStore {
  return {
    async paginateUsersByCreatedAt(opts) {
      const page = await ctx.db
        .query("users")
        .withIndex("by_created_at")
        .order("desc")
        .paginate(opts);
      return { ...page, page: page.page.map(userDocToRecord) };
    },
    async searchUsersByDisplayName(query, opts) {
      const page = await ctx.db
        .query("users")
        .withSearchIndex("search_display_name", (q) => q.search("displayName", query))
        .paginate(opts);
      return { ...page, page: page.page.map(userDocToRecord) };
    },
    async searchUsersByEmail(query, opts) {
      const page = await ctx.db
        .query("users")
        .withSearchIndex("search_email", (q) => q.search("email", query))
        .paginate(opts);
      return { ...page, page: page.page.map(userDocToRecord) };
    },
    async paginateUsersByUserId(userId, opts) {
      const page = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
        .paginate(opts);
      return { ...page, page: page.page.map(userDocToRecord) };
    },
    async paginateGroupsByCreatedAt(opts) {
      const page = await ctx.db
        .query("groups")
        .withIndex("by_created_at")
        .order("desc")
        .paginate(opts);
      return { ...page, page: page.page.map(groupDocToRecord) };
    },
    async searchGroupsByName(query, opts) {
      const page = await ctx.db
        .query("groups")
        .withSearchIndex("search_name", (q) => q.search("name", query))
        .paginate(opts);
      return { ...page, page: page.page.map(groupDocToRecord) };
    },
    async getGroupByIdString(idString) {
      const groupId = ctx.db.normalizeId("groups", idString);
      const doc = groupId === null ? null : await ctx.db.get(groupId);
      return doc === null ? null : groupDocToRecord(doc);
    },
    async getUserByDocId(userDocId) {
      const doc = await ctx.db.get(userDocId as Id<"users">);
      return doc === null ? null : userDocToRecord(doc);
    },
    async findUserByUserId(userId) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
        .unique();
      return doc === null ? null : userDocToRecord(doc);
    },
    async takeMembershipsByUser(userId, limit) {
      const docs = await ctx.db
        .query("groupMembers")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .take(limit);
      return docs.map(memberDocToRecord);
    },
    async takeMembershipsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
        .take(limit);
      return docs.map(memberDocToRecord);
    },
    async takeInvitationsByEmail(email, limit) {
      const docs = await ctx.db
        .query("groupInvitations")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(limit);
      return docs.map(invitationDocToRecord);
    },
    async takeInvitationsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("groupInvitations")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
        .take(limit);
      return docs.map(invitationDocToRecord);
    },
  };
}
