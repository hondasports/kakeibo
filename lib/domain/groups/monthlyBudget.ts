/**
 * 月予算（グループ全体の円整数）。進捗表示は月次サマリー・ダッシュボードが行う。
 */
export const MAX_MONTHLY_BUDGET_YEN = 999_999_999;

export type MonthlyBudgetValidation =
  | { success: true; amountYen: number | undefined }
  | { success: false };

/**
 * null / undefined は予算なし（解除）として受理する。
 * 受理した値はそのまま保存できる円整数に正規化して返す。
 */
export function validateMonthlyBudgetYen(
  amountYen: number | null | undefined,
): MonthlyBudgetValidation {
  if (amountYen === null || amountYen === undefined) {
    return { success: true, amountYen: undefined };
  }
  if (!Number.isInteger(amountYen) || amountYen < 0 || amountYen > MAX_MONTHLY_BUDGET_YEN) {
    return { success: false };
  }
  return { success: true, amountYen };
}

/** 予算に対する消化率（%）と残額。予算0円は100%超過として扱う。 */
export function monthlyBudgetProgress(
  budgetYen: number,
  spentYen: number,
): { usedPercent: number; remainingYen: number } {
  const remainingYen = budgetYen - spentYen;
  const usedPercent =
    budgetYen > 0 ? Math.round((spentYen / budgetYen) * 100) : spentYen > 0 ? 100 : 0;
  return { usedPercent, remainingYen };
}
