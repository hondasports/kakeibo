/**
 * savedExpenseSearches のユースケース。
 * 認証・グループ解決は presentation 層で済んでいる前提で ctx を受け取る。
 */
import {
  MAX_RECENT_SEARCHES,
  MAX_SAVED_SEARCHES,
  normalizeSavedSearchName,
  normalizeSearchQuery,
  SavedExpenseSearchError,
  toSavedExpenseSearchView,
  type SavedExpenseSearchFields,
  type SavedExpenseSearchView,
} from "../../domain/savedExpenseSearches/savedExpenseSearch";
import type {
  SavedExpenseSearchReadRepository,
  SavedExpenseSearchRepository,
} from "../../domain/savedExpenseSearches/savedExpenseSearchRepository";
import type { UsecaseGroupContext } from "../context";

export type { SavedExpenseSearchView };

export type SavedExpenseSearchList = {
  saved: SavedExpenseSearchView[];
  recent: SavedExpenseSearchView[];
};

function byCreatedAtDesc(a: SavedExpenseSearchFields, b: SavedExpenseSearchFields): number {
  return b.createdAt - a.createdAt;
}

function byUpdatedAtDesc(a: SavedExpenseSearchFields, b: SavedExpenseSearchFields): number {
  return b.updatedAt - a.updatedAt;
}

export async function saveExpenseSearch(
  ctx: UsecaseGroupContext,
  deps: { savedExpenseSearches: SavedExpenseSearchRepository },
  input: { name: string; query: string },
  now: number,
): Promise<string> {
  const name = normalizeSavedSearchName(input.name);
  const query = normalizeSearchQuery(input.query);
  if (query.length === 0) {
    throw new SavedExpenseSearchError("保存する検索条件がありません");
  }
  const existing = await deps.savedExpenseSearches.listByUserGroupAndKind(
    ctx.userId,
    ctx.groupId,
    "saved",
  );
  if (existing.length >= MAX_SAVED_SEARCHES) {
    throw new SavedExpenseSearchError(
      `保存できる検索条件は${MAX_SAVED_SEARCHES}件までです。不要な条件を削除してください。`,
    );
  }
  return await deps.savedExpenseSearches.insert({
    userId: ctx.userId,
    groupId: ctx.groupId,
    kind: "saved",
    name,
    query,
    createdAt: now,
    updatedAt: now,
  });
}

/** 最近の検索へ記録する。条件が空なら何もせず null を返す。 */
export async function recordRecentExpenseSearch(
  ctx: UsecaseGroupContext,
  deps: { savedExpenseSearches: SavedExpenseSearchRepository },
  input: { query: string },
  now: number,
): Promise<string | null> {
  const query = normalizeSearchQuery(input.query);
  if (query.length === 0) {
    return null;
  }
  const recent = await deps.savedExpenseSearches.listByUserGroupAndKind(
    ctx.userId,
    ctx.groupId,
    "recent",
  );
  const duplicate = recent.find((row) => row.query === query);
  let currentId: string;
  if (duplicate !== undefined) {
    await deps.savedExpenseSearches.touch(duplicate.id, now);
    currentId = duplicate.id;
  } else {
    currentId = await deps.savedExpenseSearches.insert({
      userId: ctx.userId,
      groupId: ctx.groupId,
      kind: "recent",
      query,
      createdAt: now,
      updatedAt: now,
    });
  }
  // 今回の行を必ず残し、他の行を新しい順に (上限-1) 件まで残す。
  const others = recent.filter((row) => row.id !== currentId).sort(byUpdatedAtDesc);
  for (const stale of others.slice(MAX_RECENT_SEARCHES - 1)) {
    await deps.savedExpenseSearches.delete(stale.id);
  }
  return currentId;
}

export async function listSavedExpenseSearches(
  ctx: UsecaseGroupContext,
  deps: { savedExpenseSearches: SavedExpenseSearchReadRepository },
): Promise<SavedExpenseSearchList> {
  const [saved, recent] = await Promise.all([
    deps.savedExpenseSearches.listByUserGroupAndKind(ctx.userId, ctx.groupId, "saved"),
    deps.savedExpenseSearches.listByUserGroupAndKind(ctx.userId, ctx.groupId, "recent"),
  ]);
  return {
    saved: [...saved].sort(byCreatedAtDesc).map(toSavedExpenseSearchView),
    recent: [...recent].sort(byUpdatedAtDesc).map(toSavedExpenseSearchView),
  };
}

export async function deleteSavedExpenseSearch(
  ctx: UsecaseGroupContext,
  deps: { savedExpenseSearches: SavedExpenseSearchRepository },
  savedExpenseSearchId: string,
): Promise<void> {
  const existing = await deps.savedExpenseSearches.findById(savedExpenseSearchId);
  if (existing === null || existing.userId !== ctx.userId || existing.groupId !== ctx.groupId) {
    throw new SavedExpenseSearchError("保存した検索が見つかりません");
  }
  await deps.savedExpenseSearches.delete(savedExpenseSearchId);
}
