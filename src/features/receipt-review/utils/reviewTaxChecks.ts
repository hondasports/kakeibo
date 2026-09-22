import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
import type { AmountBasis, TaxMode, TaxRatePercent } from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { isDiscountLine } from "../../../../lib/domain/receipt/discountItems";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";
import type {
  ReviewBlockerCode,
  ReviewCheckStatus,
  ReviewMatchKind,
  TaxSummary,
} from "./reviewCheckUtils";
import { effectiveTaxRateOf, itemPrintedYen, summaryAmountBasis } from "./reviewCheckUtils";
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

const DIRECT_PRINT_PATTERN = /(?:対象|小計|%)/;
const TAX_AMOUNT_LINE_ROLES = new Set(["tax", "subtotal", "total"]);

/**
 * 観測行テキストから税率を読み取る。印字に税率を含まない行は undefined。
 * 「8%対象」「10% 対象額」などを拾う。
 */
function parsePrintedTaxRatePercent(rawText: string): number | undefined {
  const m = /(\d{1,2}(?:\.\d+)?)\s*%/.exec(rawText.replace(/\s+/g, ""));
  if (!m) return undefined;
  const rate = Number(m[1]);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : undefined;
}

function hasDirectPrintEvidence(
  summary: TaxSummary,
  rawObservation: ReceiptRawObservation | undefined,
  summaries: TaxSummary[],
): boolean {
  if (!rawObservation) return false;
  const sameAmountCount = summaries.filter(
    (candidate) => candidate.taxableAmountYen === summary.taxableAmountYen,
  ).length;
  return rawObservation.lines.some((line) => {
    if (
      !line.explicitlyPrinted ||
      line.amountYen !== summary.taxableAmountYen ||
      !(
        line.lineRoleCandidates.some((role) => TAX_AMOUNT_LINE_ROLES.has(role)) ||
        DIRECT_PRINT_PATTERN.test(line.rawText)
      )
    )
      return false;
    const lineRate = parsePrintedTaxRatePercent(line.rawText);
    // 税率表記がある行は、その税率の内訳だけの証拠とする
    if (lineRate !== undefined) return lineRate === summary.taxRatePercent;
    // 税率表記がない行は、同一対象額の内訳が複数あると帰属を特定できない
    return sameAmountCount === 1;
  });
}

export function buildTaxRateCheck(args: {
  items: ReviewItemValues[];
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  rawObservation?: ReceiptRawObservation;
}): ReviewTaxRateCheck {
  const summaries = args.taxSummaries ?? [];
  const items = args.items;
  if (summaries.length === 0)
    return {
      status: "uncomparable",
      rows: [],
      reason: "税率別の対象額が読み取れていません",
      blockerCode: "missing-tax-summary",
      affectedItemIds: items.map((item) => item.id),
      focusTarget: "reference",
    };

  const untargetedDiscount = items.find(
    (item) => isDiscountLine(item.itemName, item.lineType) && !item.discountTargetItemId,
  );
  const unresolved = items.filter(
    (item) => buildTaxContextFromReviewItem(item).status === "unresolved",
  );

  const globalReason = untargetedDiscount
    ? "割引対象の商品が未確定のため、税率別に集計できません"
    : unresolved.length > 0
      ? `「${unresolved[0].itemName || "名称未設定"}」など税率・税込／税抜が未確定の明細があります`
      : items.length === 0
        ? "比較対象の明細がありません"
        : undefined;
  const globalBlockerCode: ReviewBlockerCode | undefined =
    untargetedDiscount || unresolved.length > 0
      ? "unresolved-tax"
      : items.length === 0
        ? "missing-items"
        : undefined;
  const globalAffectedItemIds = untargetedDiscount
    ? [untargetedDiscount.id]
    : unresolved.length > 0
      ? unresolved.map((item) => item.id)
      : [];
  const focusTarget =
    untargetedDiscount?.id ??
    unresolved[0]?.id ??
    (items.length === 0 ? "tax-summary" : globalReason ? "items" : undefined);

  const rows: ReviewTaxRateRow[] = summaries.map((summary) => {
    const basis = summaryAmountBasis(summary);
    const base = {
      taxRatePercent: summary.taxRatePercent,
      taxMode: summary.taxMode,
      taxableAmountBasis: basis,
      printedYen: summary.taxableAmountYen,
    };
    if (globalReason)
      return {
        ...base,
        status: "uncomparable" as const,
        reason: globalReason,
        blockerCode: globalBlockerCode,
        affectedItemIds: globalAffectedItemIds,
      };
    if (basis === "unknown")
      return {
        ...base,
        status: "uncomparable" as const,
        reason: "対象額の税込／税抜が未確定です",
        blockerCode: "unresolved-tax",
      };
    const bucket = items.filter(
      (item) => effectiveTaxRateOf(item, items) === summary.taxRatePercent,
    );
    const conflictingItems = bucket.filter(
      (item) =>
        (item.amountBasis === "tax_included" || item.amountBasis === "tax_excluded") &&
        item.amountBasis !== basis,
    );
    if (conflictingItems.length > 0)
      return {
        ...base,
        status: "uncomparable" as const,
        reason: "商品の税込／税抜設定が、レシートの税内訳と一致していません",
        blockerCode: "basis-conflict",
        affectedItemIds: conflictingItems.map((item) => item.id),
      };
    const printedAmounts = bucket.map(itemPrintedYen);
    if (printedAmounts.some((amount) => amount === undefined))
      return {
        ...base,
        status: "uncomparable" as const,
        reason: "明細金額が未確定です",
        blockerCode: "missing-amount",
        affectedItemIds: bucket
          .filter((item) => itemPrintedYen(item) === undefined)
          .map((item) => item.id),
      };
    const currentYen = bucket.reduce((sum, item) => sum + (itemPrintedYen(item) ?? 0), 0);
    const differenceYen = currentYen - summary.taxableAmountYen;
    if (differenceYen === 0)
      return { ...base, currentYen, differenceYen, status: "matched", matchKind: "exact" };
    const approxAllowed = !hasDirectPrintEvidence(summary, args.rawObservation, summaries);
    if (approxAllowed && Math.abs(differenceYen) === 1)
      return { ...base, currentYen, differenceYen, status: "matched", matchKind: "approx" };
    return { ...base, currentYen, differenceYen, status: "mismatch" };
  });

  if (!globalReason) {
    const summaryRates = new Set(summaries.map((summary) => summary.taxRatePercent));
    const extraRates = new Set<TaxRatePercent>();
    for (const item of items) {
      const rate = effectiveTaxRateOf(item, items);
      if (rate !== null && rate !== 0 && !summaryRates.has(rate)) extraRates.add(rate);
    }
    for (const rate of [...extraRates].sort((a, b) => a - b)) {
      const bucket = items.filter((item) => effectiveTaxRateOf(item, items) === rate);
      const printedAmounts = bucket.map(itemPrintedYen);
      rows.push({
        taxRatePercent: rate,
        currentYen: printedAmounts.every((amount) => amount !== undefined)
          ? printedAmounts.reduce((sum, amount) => sum + (amount ?? 0), 0)
          : undefined,
        status: "uncomparable",
        reason: "印字の対象額が読み取れていません",
        blockerCode: "missing-tax-summary",
        affectedItemIds: bucket.map((item) => item.id),
      });
    }
  }

  const status: ReviewCheckStatus = rows.some((row) => row.status === "mismatch")
    ? "mismatch"
    : rows.some((row) => row.status === "uncomparable")
      ? "uncomparable"
      : "matched";
  const firstUncomparableRow = rows.find((row) => row.status === "uncomparable");
  return {
    status,
    rows,
    reason: globalReason ?? firstUncomparableRow?.reason,
    blockerCode: globalBlockerCode ?? firstUncomparableRow?.blockerCode,
    affectedItemIds:
      globalAffectedItemIds.length > 0
        ? globalAffectedItemIds
        : firstUncomparableRow?.affectedItemIds,
    focusTarget:
      focusTarget ??
      firstUncomparableRow?.affectedItemIds?.[0] ??
      (rows.some((row) => row.status !== "matched") ? "items" : undefined),
  };
}
