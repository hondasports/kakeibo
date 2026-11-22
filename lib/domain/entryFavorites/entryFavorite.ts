/**
 * お気に入りの支出項目（entryFavorites）のドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */
import {
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "../expenseEntries/expenseEntryItem";

export class EntryFavoriteError extends Error {}

export type EntryFavoriteFields = {
  id: string;
  userId: string;
  groupId: string;
  title: string;
  categoryId: string;
  amountYen: number;
  memo?: string;
  createdAt: number;
  updatedAt: number;
};

export type EntryFavoriteInput = {
  title: string;
  categoryId: string;
  amountYen: number;
  memo?: string;
};

/** お気に入りとして保存する入力を検証し、永続化フィールドを構築する。 */
export function buildEntryFavoriteFields(
  ctx: { userId: string; groupId: string },
  input: EntryFavoriteInput,
  now: number,
): Omit<EntryFavoriteFields, "id"> {
  const titleResult = validateExpenseTitle(input.title);
  if (!titleResult.success) {
    throw new EntryFavoriteError(
      titleResult.error === "empty" ? "店舗名 / 支払先は必須です" : "店舗名 / 支払先が長すぎます",
    );
  }
  const amountResult = validateExpenseAmount(input.amountYen);
  if (!amountResult.success) {
    throw new EntryFavoriteError("金額は1円以上の整数で入力してください");
  }
  const memoResult = validateExpenseMemo(input.memo);
  if (!memoResult.success) {
    throw new EntryFavoriteError("メモが長すぎます");
  }
  if (input.categoryId.trim() === "") {
    throw new EntryFavoriteError("カテゴリを選択してください");
  }

  return {
    userId: ctx.userId,
    groupId: ctx.groupId,
    title: titleResult.title,
    categoryId: input.categoryId,
    amountYen: input.amountYen,
    memo: memoResult.memo,
    createdAt: now,
    updatedAt: now,
  };
}
