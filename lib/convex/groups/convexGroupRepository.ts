/**
 * GroupRepository の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { GroupRecord } from "../../domain/groups/group";
import type { GroupReadRepository, GroupRepository } from "../../domain/groups/groupRepository";

function groupDocToFields(doc: Doc<"groups">): GroupRecord {
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

export function createGroupRepository(ctx: Pick<MutationCtx, "db">): GroupRepository {
  return {
    ...createGroupReadRepository(ctx),
    async insert(fields) {
      return await ctx.db.insert("groups", fields as Omit<Doc<"groups">, "_id" | "_creationTime">);
    },
    async patch(groupId, fields) {
      await ctx.db.patch(groupId as Id<"groups">, fields as Partial<Doc<"groups">>);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createGroupReadRepository(ctx: Pick<QueryCtx, "db">): GroupReadRepository {
  return {
    async get(groupId) {
      const doc = await ctx.db.get(groupId as Id<"groups">);
      return doc === null ? null : groupDocToFields(doc);
    },
  };
}
