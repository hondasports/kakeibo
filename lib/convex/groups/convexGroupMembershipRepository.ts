/**
 * GroupMembershipRepository の Convex 実装。
 * クエリ読み出しは既存の groupQueryHelpers 経由（テストモック互換のため）。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { GroupMemberRecord } from "../../domain/groups/groupMember";
import type {
  GroupMembershipReadRepository,
  GroupMembershipRepository,
} from "../../domain/groups/groupMembershipRepository";
import { readQueryDoc, readQueryDocs } from "../../../convex/groups/lib/groupQueryHelpers";

function memberDocToFields(doc: Doc<"groupMembers">): GroupMemberRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    userId: doc.userId,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createMembershipRead(ctx: Pick<QueryCtx, "db">): GroupMembershipReadRepository {
  return {
    async listByUser(userId) {
      const docs = await readQueryDocs(
        ctx.db.query("groupMembers").withIndex("by_user_id", (q) => q.eq("userId", userId)),
      );
      return docs.map(memberDocToFields);
    },
    async findByGroupAndUser(groupId, userId) {
      const doc = await readQueryDoc(
        ctx.db
          .query("groupMembers")
          .withIndex("by_group_id_and_user_id", (q) =>
            q.eq("groupId", groupId as Id<"groups">).eq("userId", userId),
          ),
      );
      return doc === null ? null : memberDocToFields(doc);
    },
    async listByGroup(groupId) {
      const docs = await readQueryDocs(
        ctx.db
          .query("groupMembers")
          .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">)),
      );
      return docs.map(memberDocToFields);
    },
    async listByGroupAndRole(groupId, role, limit) {
      const query = ctx.db
        .query("groupMembers")
        .withIndex("by_group_id_and_role", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("role", role),
        );
      const docs = limit === undefined ? await readQueryDocs(query) : await query.take(limit);
      return docs.map(memberDocToFields);
    },
  };
}

export function createGroupMembershipRepository(
  ctx: Pick<MutationCtx, "db">,
): GroupMembershipRepository {
  return {
    ...createMembershipRead(ctx),
    async insert(fields) {
      return await ctx.db.insert(
        "groupMembers",
        fields as Omit<Doc<"groupMembers">, "_id" | "_creationTime">,
      );
    },
    async patch(membershipId, fields) {
      await ctx.db.patch(
        membershipId as Id<"groupMembers">,
        fields as Partial<Doc<"groupMembers">>,
      );
    },
    async delete(membershipId) {
      await ctx.db.delete(membershipId as Id<"groupMembers">);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createGroupMembershipReadRepository(
  ctx: Pick<QueryCtx, "db">,
): GroupMembershipReadRepository {
  return createMembershipRead(ctx);
}
