/**
 * SavedExpenseSearchRepository の Convex 実装。
 * domain 層の型（string ID）と Convex の Id<> の変換をここで吸収する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  SavedExpenseSearchFields,
  SavedExpenseSearchKind,
} from "../../domain/savedExpenseSearches/savedExpenseSearch";
import type {
  SavedExpenseSearchReadRepository,
  SavedExpenseSearchRepository,
} from "../../domain/savedExpenseSearches/savedExpenseSearchRepository";

function toFields(doc: Doc<"savedExpenseSearches">): SavedExpenseSearchFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id };
}

async function findById(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  id: string,
): Promise<SavedExpenseSearchFields | null> {
  const doc = await ctx.db.get(id as Id<"savedExpenseSearches">);
  return doc === null ? null : toFields(doc);
}

async function listByUserGroupAndKind(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userId: string,
  groupId: string,
  kind: SavedExpenseSearchKind,
): Promise<SavedExpenseSearchFields[]> {
  const docs = await ctx.db
    .query("savedExpenseSearches")
    .withIndex("by_user_id_and_group_id_and_kind", (q) =>
      q
        .eq("userId", userId)
        .eq("groupId", groupId as Id<"groups">)
        .eq("kind", kind),
    )
    .collect();
  return docs.map(toFields);
}

export function createSavedExpenseSearchReadRepository(
  ctx: Pick<QueryCtx, "db">,
): SavedExpenseSearchReadRepository {
  return {
    findById: (id) => findById(ctx, id),
    listByUserGroupAndKind: (userId, groupId, kind) =>
      listByUserGroupAndKind(ctx, userId, groupId, kind),
  };
}

export function createSavedExpenseSearchRepository(
  ctx: Pick<MutationCtx, "db">,
): SavedExpenseSearchRepository {
  return {
    findById: (id) => findById(ctx, id),
    listByUserGroupAndKind: (userId, groupId, kind) =>
      listByUserGroupAndKind(ctx, userId, groupId, kind),
    async insert(fields) {
      return await ctx.db.insert("savedExpenseSearches", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
      });
    },
    async touch(id, updatedAt) {
      await ctx.db.patch(id as Id<"savedExpenseSearches">, { updatedAt });
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"savedExpenseSearches">);
    },
  };
}
