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

export type { EntryFavoriteFields, EntryFavoriteInput };

export async function saveEntryFavorite(
  ctx: UsecaseGroupContext,
  deps: { entryFavorites: EntryFavoriteRepository },
  input: EntryFavoriteInput,
  now: number,
): Promise<string> {
  return await deps.entryFavorites.insert(buildEntryFavoriteFields(ctx, input, now));
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
