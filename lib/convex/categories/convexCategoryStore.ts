/**
 * CategoryStore の Convex 実装。
 * endpoint が発行していた ctx.db 呼出形状をここに隔離する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  CategoryPatch,
  CategoryStore,
  CategoryStoreRecord,
  NewCategoryFields,
} from "../../domain/categories/store";

export function docToCategoryRecord(doc: Doc<"categories">): CategoryStoreRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    groupId: doc.groupId,
    name: doc.name,
    ...(doc.description === undefined ? {} : { description: doc.description }),
    color: doc.color,
    isActive: doc.isActive,
    sortOrder: doc.sortOrder,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** presentation 層が既存の Doc 返却形状を再現するための変換。 */
export function categoryRecordToDoc(record: CategoryStoreRecord): Doc<"categories"> {
  return {
    _id: record.id as Id<"categories">,
    _creationTime: record.creationTime,
    groupId: record.groupId as Id<"groups">,
    name: record.name,
    ...(record.description === undefined ? {} : { description: record.description }),
    color: record.color,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** query 側でも使える読み取り専用メソッド。 */
export type CategoryReader = Pick<
  CategoryStore,
  "findByGroupAndSortOrder" | "listForWriteByGroup" | "listActive" | "listForSettings" | "get"
>;

export function createCategoryReader(ctx: Pick<QueryCtx, "db">): CategoryReader {
  return {
    async findByGroupAndSortOrder(groupId, sortOrder) {
      const doc = await ctx.db
        .query("categories")
        .withIndex("by_group_id_and_sort_order", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("sortOrder", sortOrder),
        )
        .unique();
      return doc === null ? null : docToCategoryRecord(doc);
    },

    async listForWriteByGroup(groupId, limit) {
      const docs = await ctx.db
        .query("categories")
        .withIndex("by_group_id_and_sort_order", (q) => q.eq("groupId", groupId as Id<"groups">))
        .take(limit);
      return docs.map(docToCategoryRecord);
    },

    async listActive(groupId) {
      const docs = await ctx.db
        .query("categories")
        .withIndex("by_group_id_and_is_active_and_sort_order", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("isActive", true),
        )
        .order("asc")
        .collect();
      return docs.map(docToCategoryRecord);
    },

    async listForSettings(groupId, limit) {
      const docs = await ctx.db
        .query("categories")
        .withIndex("by_group_id_and_sort_order", (q) => q.eq("groupId", groupId as Id<"groups">))
        .order("asc")
        .take(limit);
      return docs.map(docToCategoryRecord);
    },

    async get(id) {
      const doc = await ctx.db.get(id as Id<"categories">);
      return doc === null ? null : docToCategoryRecord(doc);
    },
  };
}

export function createCategoryStore(ctx: Pick<MutationCtx, "db">): CategoryStore {
  return {
    ...createCategoryReader(ctx),

    async insert(fields: NewCategoryFields) {
      return await ctx.db.insert("categories", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
      });
    },

    async patch(id, patch: CategoryPatch) {
      await ctx.db.patch(id as Id<"categories">, patch);
    },

    async deleteMany(ids) {
      await Promise.all(ids.map((id) => ctx.db.delete(id as Id<"categories">)));
    },
  };
}
