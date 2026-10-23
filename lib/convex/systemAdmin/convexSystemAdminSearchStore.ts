/**
 * SystemAdminSearchStore の Convex 実装。
 * 検索インデックス・created_at ページネーション・normalizeId の知識はここに閉じ込める。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SystemAdminSearchStore } from "../../domain/systemAdmin/searchStore";
import { userDocToRecord } from "../groups/convexUserDirectory";
import { groupDocToFields } from "../groups/convexGroupRepository";
import { memberDocToFields } from "../groups/convexGroupMembershipRepository";
import { invitationDocToFields } from "../groups/convexGroupInvitationRepository";

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
      return { ...page, page: page.page.map(groupDocToFields) };
    },
    async searchGroupsByName(query, opts) {
      const page = await ctx.db
        .query("groups")
        .withSearchIndex("search_name", (q) => q.search("name", query))
        .paginate(opts);
      return { ...page, page: page.page.map(groupDocToFields) };
    },
    async getGroupByIdString(idString) {
      const groupId = ctx.db.normalizeId("groups", idString);
      const doc = groupId === null ? null : await ctx.db.get(groupId);
      return doc === null ? null : groupDocToFields(doc);
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
      return docs.map(memberDocToFields);
    },
    async takeMembershipsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
        .take(limit);
      return docs.map(memberDocToFields);
    },
    async takeInvitationsByEmail(email, limit) {
      const docs = await ctx.db
        .query("groupInvitations")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(limit);
      return docs.map(invitationDocToFields);
    },
    async takeInvitationsByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("groupInvitations")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
        .take(limit);
      return docs.map(invitationDocToFields);
    },
  };
}
