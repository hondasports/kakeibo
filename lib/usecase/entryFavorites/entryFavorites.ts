/**
 * entryFavorites のユースケース。
 * 認証・グループ解決は presentation 層で済んでいる前提で ctx を受け取る。
 */
import {
  buildEntryFavoriteFields,
  EntryFavoriteError,
  type EntryFavoriteFields,
  type EntryFavoriteInput,
} from "../../domain/entryFavorites/entryFavorite";
import type {
  EntryFavoriteReadRepository,
  EntryFavoriteRepository,
} from "../../domain/entryFavorites/entryFavoriteRepository";
import type { UsecaseGroupContext } from "../context";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import { assertUsableCategory } from "../categories/assertUsableCategory";

export type { EntryFavoriteFields, EntryFavoriteInput };

export async function saveEntryFavorite(
  ctx: UsecaseGroupContext,
  deps: { entryFavorites: EntryFavoriteRepository; categories: CategoryRepository },
  input: EntryFavoriteInput,
  now: number,
): Promise<string> {
  // 入力検証を先に済ませてから、他グループ・無効化カテゴリへの参照が
  // 保存に残らないよう実績作成と同じ検証を行う。
  const fields = buildEntryFavoriteFields(ctx, input, now);
  await assertUsableCategory(deps.categories, input.categoryId, ctx.groupId);
  return await deps.entryFavorites.insert(fields);
}

export async function listEntryFavorites(
  ctx: UsecaseGroupContext,
  deps: { entryFavorites: EntryFavoriteReadRepository },
): Promise<EntryFavoriteFields[]> {
  return await deps.entryFavorites.listByUserAndGroup(ctx.userId, ctx.groupId);
}

export async function deleteEntryFavorite(
  ctx: UsecaseGroupContext,
  deps: { entryFavorites: EntryFavoriteRepository },
  entryFavoriteId: string,
): Promise<void> {
  const existing = await deps.entryFavorites.findById(entryFavoriteId);
  if (existing === null || existing.userId !== ctx.userId || existing.groupId !== ctx.groupId) {
    throw new EntryFavoriteError("お気に入りが見つかりません");
  }
  await deps.entryFavorites.delete(entryFavoriteId);
}
