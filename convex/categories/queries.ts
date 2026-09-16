import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import {
  categoryRecordToDoc,
  createCategoryReader,
} from "../../lib/convex/categories/convexCategoryStore";
import {
  listActive as listActiveUsecase,
  listForSettings as listForSettingsUsecase,
} from "../../lib/usecase/categories";

/** listActive query の handler ロジック（テスト用に export） */
export async function listActiveHandler(ctx: QueryCtx): Promise<Doc<"categories">[]> {
  const { groupId } = await requireGroupMembership(ctx);
  const records = await listActiveUsecase(createCategoryReader(ctx), groupId);
  return records.map(categoryRecordToDoc);
}

/** listForSettings query の handler ロジック（テスト用に export） */
export async function listForSettingsHandler(ctx: QueryCtx): Promise<Doc<"categories">[]> {
  const { groupId } = await requireGroupMembership(ctx);
  const records = await listForSettingsUsecase(createCategoryReader(ctx), groupId);
  return records.map(categoryRecordToDoc);
}

/**
 * ログインユーザーのグループのアクティブなカテゴリを sortOrder 昇順で返す query。
 * groupId はサーバー側でグループメンバーシップから解決するため、
 * クライアントから groupId を渡さない。
 */
export const listActive = query({
  args: {},
  handler: listActiveHandler,
});

/**
 * カテゴリ設定画面用に、無効化済みを含むカテゴリを sortOrder 昇順で返す。
 * 既存 receipt は categoryId 参照を維持するため、カテゴリは削除せず無効化する。
 */
export const listForSettings = query({
  args: {},
  handler: listForSettingsHandler,
});
