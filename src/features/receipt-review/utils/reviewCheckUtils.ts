import type { AmountBasis, TaxMode, TaxRatePercent } from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { isDiscountLine } from "../../../../lib/domain/receipt/discountItems";
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

export type ReviewAmountCheck = {
  status: ReviewCheckStatus;
  /** external = 外税2段階比較、direct = 明細合計と支払額の直接比較 */
  variant: "external" | "direct";
  paidTotalYen?: number;
  /** 明細の印字額合計（外税時の税抜小計との比較用） */
  itemsPrintedTotalYen?: number;
  /** 支払額との直接比較に使う合計（税込正規化を優先。比較不能な明細があるときは undefined） */
  itemsComparableTotalYen?: number;
  /** 外税時に印字された税抜小計（Σ対象額） */
  printedSubtotalYen?: number;
  /** 外税時に印字された税額合計 */
  printedTaxYen?: number;
  /** 外税時の 小計＋税額 */
  expectedPaidYen?: number;
  mismatchStep?: "itemsVsSubtotal" | "subtotalTaxVsPaid" | "itemsVsPaid";
  /** 計算値 − 印字値（または支払額）。0以外のとき不一致 */
  differenceYen?: number;
  /** 比較不能の理由 */
  reason?: string;
  blockerCode?: ReviewBlockerCode;
  affectedItemIds?: string[];
  /** 修正・確認を促すジャンプ先（セクションまたは明細id） */
  focusTarget?: string;
};

export type ReviewTaxRateRow = {
  taxRatePercent: TaxRatePercent;
  taxMode?: TaxMode;
  taxableAmountBasis?: AmountBasis;
  /** 印字された税率別対象額。サマリが無い税率では undefined */
  printedYen?: number;
  /** 同じ税込／税抜基準で集計した明細側の印字額合計 */
  currentYen?: number;
  status: ReviewCheckStatus;
  matchKind?: ReviewMatchKind;
  /** 現在 − 印字。0以外のとき不一致 */
  differenceYen?: number;
  reason?: string;
  blockerCode?: ReviewBlockerCode;
  affectedItemIds?: string[];
};

export type ReviewTaxRateCheck = {
  status: ReviewCheckStatus;
  rows: ReviewTaxRateRow[];
  /** 全行比較不能にする理由（割引対象・税率の未確定など） */
  reason?: string;
  blockerCode?: ReviewBlockerCode;
  affectedItemIds?: string[];
  /** 修正・確認を促すジャンプ先（セクションまたは明細id） */
  focusTarget?: string;
};

export type ReviewChecks = {
  amount: ReviewAmountCheck;
  taxRate: ReviewTaxRateCheck;
};

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
  if (summary.taxableAmountBasis !== "unknown") return summary.taxableAmountBasis;
  if (summary.taxMode === "external") return "tax_excluded";
  if (summary.taxMode === "included") return "tax_included";
  return "unknown";
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
  const basisByRate = new Map(
    summaries.map((summary) => [summary.taxRatePercent, summaryAmountBasis(summary)]),
  );
  return items.filter((item) => {
    const rate = effectiveTaxRateOf(item, items);
    if (rate === null) return false;
    const expectedBasis = basisByRate.get(rate);
    if (!expectedBasis || expectedBasis === "unknown") return false;
    return (
      (item.amountBasis === "tax_included" || item.amountBasis === "tax_excluded") &&
      item.amountBasis !== expectedBasis
    );
  });
}
