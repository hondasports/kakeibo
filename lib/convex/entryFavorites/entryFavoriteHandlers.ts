/**
 * entryFavorites 系 endpoint のハンドラグルー。
 * 認証・グループ解決と依存構築（composition）だけを行い、
 * 業務ロジックは lib/usecase に委譲する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import {
  createEntryFavoriteReadRepository,
  createEntryFavoriteRepository,
} from "./convexEntryFavoriteRepository";
import { createCategoryRepository } from "../categories/categoryRepository";
import {
  deleteEntryFavorite,
  listEntryFavorites,
  saveEntryFavorite,
} from "../../usecase/entryFavorites";

export type SaveEntryFavoriteArgs = {
  title: string;
  categoryId: Id<"categories">;
  amountYen: number;
  memo?: string;
};

export type DeleteEntryFavoriteArgs = {
  entryFavoriteId: Id<"entryFavorites">;
};

export async function saveEntryFavoriteHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: SaveEntryFavoriteArgs,
): Promise<Id<"entryFavorites">> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return (await saveEntryFavorite(
    { groupId, userId },
    {
      entryFavorites: createEntryFavoriteRepository(ctx),
      categories: createCategoryRepository(ctx),
    },
    args,
    Date.now(),
  )) as Id<"entryFavorites">;
}

export async function listEntryFavoritesHandler(ctx: Pick<QueryCtx, "auth" | "db">) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return await listEntryFavorites(
    { groupId, userId },
    { entryFavorites: createEntryFavoriteReadRepository(ctx) },
  );
}

export async function deleteEntryFavoriteHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: DeleteEntryFavoriteArgs,
): Promise<void> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  await deleteEntryFavorite(
    { groupId, userId },
    { entryFavorites: createEntryFavoriteRepository(ctx) },
    args.entryFavoriteId,
  );
}
