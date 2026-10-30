import type { AmountBasis, TaxRatePercent } from "../receipt/tax/types";
import type { AiExpenseDraft, ReviewItemValues } from "./reviewTypes";
import { isDiscountLine } from "../receipt/discountItems";
import { resolveAmountBasis } from "../receipt/tax/resolveAmountBasis";
import { matchTaxSummaryItems } from "../receipt/tax/taxAmountBasis";
/** 金額確認・税率別集計それぞれの判定状態。 */
export type ReviewCheckStatus = "matched" | "mismatch" | "uncomparable";

export type ReviewBlockerCode =
  | "missing-paid-total"
  | "missing-items"
  | "missing-amount"
  | "unresolved-tax"
  | "basis-conflict"
  | "missing-tax-summary";

/** 逆算由来の対象額だけに許容する±1円の一致を、直接印字の完全一致と区別する。 */
export type ReviewMatchKind = "exact" | "approx";

export type TaxSummary = NonNullable<AiExpenseDraft["taxSummaries"]>[number];

export function parseYenInput(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 明細の比較用金額。現在の入力値を使い、空欄・不正値は未確定として扱う。
 * 入力値が有効な場合は handleReviewItemChange が printedAmountYen へ同期済みのため
 * 印字額と一致するが、空欄のまま印字額へフォールバックすると未確定を見逃す。
 */
export function itemPrintedYen(item: ReviewItemValues): number | undefined {
  const entered = parseYenInput(item.amountYen);
  if (entered === undefined) return undefined;
  return item.printedAmountYen ?? entered;
}

/**
 * 支払額との比較に使う税込換算額。
 * - 税抜明細: 税額配分が完了（allocated）した normalizedAmountYen のみが税込相当。
 *   未配分の印字額（税抜）を支払額（税込）と比較しない。
 * - 税込／基準が unknown の明細: 税込は印字額で比較。unknown は比較不能。
 * - amountBasis 未設定: 税解釈を通っていない明細は印字額をそのまま比較する。
 */
export function itemComparableYen(item: ReviewItemValues): number | undefined {
  const printed = itemPrintedYen(item);
  if (printed === undefined) return undefined;
  if (item.amountBasis === "tax_excluded") {
    return item.taxAllocationStatus === "allocated" ? item.normalizedAmountYen : undefined;
  }
  if (item.amountBasis === "unknown") return undefined;
  return printed;
}

/** サマリの対象額基準。basis が unknown でも税モードから意味を復元する。 */
export function summaryAmountBasis(summary: TaxSummary): AmountBasis {
  return resolveAmountBasis(summary);
}

export function effectiveTaxRateOf(
  item: ReviewItemValues,
  items: ReviewItemValues[],
): TaxRatePercent | null {
  if (isDiscountLine(item.itemName, item.lineType)) {
    const target = items.find((candidate) => candidate.id === item.discountTargetItemId);
    return target?.taxRatePercent ?? null;
  }
  return item.taxRatePercent ?? null;
}

export function findBasisConflicts(
  items: ReviewItemValues[],
  summaries: TaxSummary[],
): ReviewItemValues[] {
  const checks = summaries.map((summary) => {
    const bucket = items.filter(
      (item) => effectiveTaxRateOf(item, items) === summary.taxRatePercent,
    );
    return {
      rate: summary.taxRatePercent,
      basis: summaryAmountBasis(summary),
      reconciled:
        matchTaxSummaryItems(
          summary,
          bucket.map((item) => ({
            amountBasis: item.amountBasis ?? "unknown",
            printedAmountYen: itemPrintedYen(item) ?? Number.NaN,
          })),
        ) !== undefined,
    };
  });
  return items.filter((item) => {
    const rate = effectiveTaxRateOf(item, items);
    if (rate === null) return false;
    return (
      (item.amountBasis === "tax_included" || item.amountBasis === "tax_excluded") &&
      checks.some(
        (check) =>
          check.rate === rate &&
          check.basis !== "unknown" &&
          item.amountBasis !== check.basis &&
          !check.reconciled,
      )
    );
  });
}
