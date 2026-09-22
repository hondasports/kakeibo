import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import type { ReviewBlockerCode, ReviewCheckStatus } from "./reviewCheckUtils";
import {
  findBasisConflicts,
  itemComparableYen,
  itemPrintedYen,
  summaryAmountBasis,
} from "./reviewCheckUtils";
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

export function buildAmountCheck(args: {
  items: ReviewItemValues[];
  paidTotalYen?: number;
  taxSummaries?: AiExpenseDraft["taxSummaries"];
}): ReviewAmountCheck {
  const summaries = args.taxSummaries ?? [];
  const paidTotalYen = args.paidTotalYen;
  const external =
    summaries.length > 0 &&
    summaries.every(
      (summary) =>
        summaryAmountBasis(summary) === "tax_excluded" &&
        (summary.taxMode === "external" || summary.taxMode === "unknown"),
    );
  const variant: "external" | "direct" = external ? "external" : "direct";

  if (paidTotalYen === undefined || !Number.isFinite(paidTotalYen))
    return {
      status: "uncomparable",
      variant,
      paidTotalYen,
      reason: "支払額が未確定です",
      blockerCode: "missing-paid-total",
      focusTarget: "amountYen",
    };
  if (args.items.length === 0)
    return {
      status: "uncomparable",
      variant,
      paidTotalYen,
      reason: "比較対象の明細がありません",
      blockerCode: "missing-items",
      focusTarget: "items",
    };
  const missingAmount = args.items.find((item) => itemPrintedYen(item) === undefined);
  if (missingAmount)
    return {
      status: "uncomparable",
      variant,
      paidTotalYen,
      reason: "明細金額が未確定です",
      blockerCode: "missing-amount",
      affectedItemIds: [missingAmount.id],
      focusTarget: missingAmount.id,
    };

  const basisConflicts = findBasisConflicts(args.items, summaries);
  if (basisConflicts.length > 0)
    return {
      status: "uncomparable",
      variant,
      paidTotalYen,
      reason: "商品の税込／税抜設定が、レシートの税内訳と一致していません",
      blockerCode: "basis-conflict",
      affectedItemIds: basisConflicts.map((item) => item.id),
      focusTarget: basisConflicts[0].id,
    };

  const itemsPrintedTotalYen = args.items.reduce(
    (sum, item) => sum + (itemPrintedYen(item) ?? 0),
    0,
  );
  // 税込換算できない明細が1件でもあれば合計は確定できない。欠損を0円扱いしない。
  const itemsComparableTotalYen = args.items.reduce<number | undefined>((sum, item) => {
    const amount = itemComparableYen(item);
    return sum === undefined || amount === undefined ? undefined : sum + amount;
  }, 0);

  if (external) {
    const printedSubtotalYen = summaries.reduce(
      (sum, summary) => sum + summary.taxableAmountYen,
      0,
    );
    const printedTaxYen = summaries.reduce((sum, summary) => sum + summary.taxYen, 0);
    const expectedPaidYen = printedSubtotalYen + printedTaxYen;
    const base = {
      variant,
      paidTotalYen,
      itemsPrintedTotalYen,
      itemsComparableTotalYen,
      printedSubtotalYen,
      printedTaxYen,
      expectedPaidYen,
    } as const;
    const subtotalGap = itemsPrintedTotalYen - printedSubtotalYen;
    if (subtotalGap !== 0)
      return {
        ...base,
        status: "mismatch",
        mismatchStep: "itemsVsSubtotal",
        differenceYen: subtotalGap,
        focusTarget: "items",
      };
    const paidGap = expectedPaidYen - paidTotalYen;
    if (paidGap !== 0)
      return {
        ...base,
        status: "mismatch",
        mismatchStep: "subtotalTaxVsPaid",
        differenceYen: paidGap,
        focusTarget: "amountYen",
      };
    return { ...base, status: "matched" };
  }

  // 税込基準が未確定の明細（税抜かつ未配分、基準不明など）を支払額と比較しない
  const uncertainItem = args.items.find((item) => itemComparableYen(item) === undefined);
  if (uncertainItem || itemsComparableTotalYen === undefined)
    return {
      status: "uncomparable",
      variant,
      paidTotalYen,
      itemsPrintedTotalYen,
      reason: "税率・税込／税抜が未確定の明細があるため、支払額と比較できません",
      blockerCode: "unresolved-tax",
      affectedItemIds: args.items
        .filter((item) => itemComparableYen(item) === undefined)
        .map((item) => item.id),
      focusTarget: uncertainItem?.id,
    };

  const differenceYen = itemsComparableTotalYen - paidTotalYen;
  const base = { variant, paidTotalYen, itemsComparableTotalYen, itemsPrintedTotalYen };
  if (differenceYen !== 0)
    return {
      ...base,
      status: "mismatch",
      mismatchStep: "itemsVsPaid",
      differenceYen,
      focusTarget: "items",
    };
  return { ...base, status: "matched" };
}

/** 印字対象額が直接読み取れている証拠。無い場合は逆算由来の可能性として±1円を許容する。 */
