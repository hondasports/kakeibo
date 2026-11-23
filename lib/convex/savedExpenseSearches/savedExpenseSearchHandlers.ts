/**
 * savedExpenseSearches 系 endpoint のハンドラグルー。
 * 認証・グループ解決と依存構築（composition）だけを行い、
 * 業務ロジックは lib/usecase に委譲する。userId・groupId はクライアントから受け取らない。
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import {
  createSavedExpenseSearchReadRepository,
  createSavedExpenseSearchRepository,
} from "./convexSavedExpenseSearchRepository";
import { SavedExpenseSearchError } from "../../domain/savedExpenseSearches/savedExpenseSearch";
import {
  deleteSavedExpenseSearch,
  listSavedExpenseSearches,
  recordRecentExpenseSearch,
  saveExpenseSearch,
} from "../../usecase/savedExpenseSearches";

export type SaveExpenseSearchArgs = { name: string; query: string };
export type RecordRecentExpenseSearchArgs = { query: string };
export type DeleteSavedExpenseSearchArgs = {
  savedExpenseSearchId: Id<"savedExpenseSearches">;
};

/**
 * 本番では通常の Error のメッセージがクライアントへ届かないため、
 * 利用者向けの検証エラーは ConvexError にして日本語文言を返す。
 */
async function withClientSafeErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SavedExpenseSearchError) {
      throw new ConvexError(error.message);
    }
    throw error;
  }
}

export async function saveExpenseSearchHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: SaveExpenseSearchArgs,
): Promise<Id<"savedExpenseSearches">> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return (await withClientSafeErrors(() =>
    saveExpenseSearch(
      { groupId, userId },
      { savedExpenseSearches: createSavedExpenseSearchRepository(ctx) },
      args,
      Date.now(),
    ),
  )) as Id<"savedExpenseSearches">;
}

export async function recordRecentExpenseSearchHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: RecordRecentExpenseSearchArgs,
): Promise<Id<"savedExpenseSearches"> | null> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return (await withClientSafeErrors(() =>
    recordRecentExpenseSearch(
      { groupId, userId },
      { savedExpenseSearches: createSavedExpenseSearchRepository(ctx) },
      args,
      Date.now(),
    ),
  )) as Id<"savedExpenseSearches"> | null;
}

export async function listSavedExpenseSearchesHandler(ctx: Pick<QueryCtx, "auth" | "db">) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return await listSavedExpenseSearches(
    { groupId, userId },
    { savedExpenseSearches: createSavedExpenseSearchReadRepository(ctx) },
  );
}

export async function deleteSavedExpenseSearchHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: DeleteSavedExpenseSearchArgs,
): Promise<void> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  await withClientSafeErrors(() =>
    deleteSavedExpenseSearch(
      { groupId, userId },
      { savedExpenseSearches: createSavedExpenseSearchRepository(ctx) },
      args.savedExpenseSearchId,
    ),
  );
}
