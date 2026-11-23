/**
 * EntryFavoriteRepository の Convex 実装。
 * domain 層の型（string ID）と Convex の Id<> の変換をここで吸収する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { EntryFavoriteFields } from "../../domain/entryFavorites/entryFavorite";
import type {
  EntryFavoriteReadRepository,
  EntryFavoriteRepository,
} from "../../domain/entryFavorites/entryFavoriteRepository";

function toFields(doc: Doc<"entryFavorites">): EntryFavoriteFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id };
}

async function findFavoriteById(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  id: string,
): Promise<EntryFavoriteFields | null> {
  const doc = await ctx.db.get(id as Id<"entryFavorites">);
  return doc === null ? null : toFields(doc);
}

async function listFavoritesByUserAndGroup(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  userId: string,
  groupId: string,
): Promise<EntryFavoriteFields[]> {
  const docs = await ctx.db
    .query("entryFavorites")
    .withIndex("by_user_id_and_group_id", (q) =>
      q.eq("userId", userId).eq("groupId", groupId as Id<"groups">),
    )
    .collect();
  return docs.sort((a, b) => b.createdAt - a.createdAt).map(toFields);
}

export function createEntryFavoriteReadRepository(
  ctx: Pick<QueryCtx, "db">,
): EntryFavoriteReadRepository {
  return {
    findById: (id) => findFavoriteById(ctx, id),
    listByUserAndGroup: (userId, groupId) => listFavoritesByUserAndGroup(ctx, userId, groupId),
  };
}

export function createEntryFavoriteRepository(
  ctx: Pick<MutationCtx, "db">,
): EntryFavoriteRepository {
  return {
    findById: (id) => findFavoriteById(ctx, id),
    listByUserAndGroup: (userId, groupId) => listFavoritesByUserAndGroup(ctx, userId, groupId),
    async insert(fields) {
      return await ctx.db.insert("entryFavorites", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
        categoryId: fields.categoryId as Id<"categories">,
      });
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"entryFavorites">);
    },
  };
}
