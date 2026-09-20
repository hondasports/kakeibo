import type { ReceiptRawObservation } from "../../../../lib/domain/receipt/observations";
import type { AmountBasis, TaxMode, TaxRatePercent } from "../../../../lib/receiptTax/types";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { isDiscountLine } from "./discountItems";
import { buildTaxContextFromReviewItem } from "./receiptItemTaxViewModel";

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

type TaxSummary = NonNullable<AiExpenseDraft["taxSummaries"]>[number];

function parseYenInput(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 明細の比較用金額。現在の入力値を使い、空欄・不正値は未確定として扱う。
 * 入力値が有効な場合は handleReviewItemChange が printedAmountYen へ同期済みのため
 * 印字額と一致するが、空欄のまま印字額へフォールバックすると未確定を見逃す。
 */
function itemPrintedYen(item: ReviewItemValues): number | undefined {
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
function itemComparableYen(item: ReviewItemValues): number | undefined {
  const printed = itemPrintedYen(item);
  if (printed === undefined) return undefined;
  if (item.amountBasis === "tax_excluded") {
    return item.taxAllocationStatus === "allocated" ? item.normalizedAmountYen : undefined;
  }
  if (item.amountBasis === "unknown") return undefined;
  return printed;
}

/** サマリの対象額基準。basis が unknown でも税モードから意味を復元する。 */
function summaryAmountBasis(summary: TaxSummary): AmountBasis {
  if (summary.taxableAmountBasis !== "unknown") return summary.taxableAmountBasis;
  if (summary.taxMode === "external") return "tax_excluded";
  if (summary.taxMode === "included") return "tax_included";
  return "unknown";
}

function effectiveTaxRateOf(
  item: ReviewItemValues,
  items: ReviewItemValues[],
): TaxRatePercent | null {
  if (isDiscountLine(item.itemName, item.lineType)) {
    const target = items.find((candidate) => candidate.id === item.discountTargetItemId);
    return target?.taxRatePercent ?? null;
  }
  return item.taxRatePercent ?? null;
}

function findBasisConflicts(
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

export function buildReviewChecks(args: {
  items: ReviewItemValues[];
  paidTotalYen?: number;
  taxSummaries?: AiExpenseDraft["taxSummaries"];
  rawObservation?: ReceiptRawObservation;
}): ReviewChecks {
  return {
    amount: buildAmountCheck(args),
    taxRate: buildTaxRateCheck(args),
  };
}
