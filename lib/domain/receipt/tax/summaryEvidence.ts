import type { ReceiptRawObservationLine } from "../observations";
import type { ExtractedReceiptItem, ExtractedTaxSummary } from "./types";

function normalizedText(rawText: string): string {
  return rawText.normalize("NFKC").replace(/\s+/g, "");
}

function printedRates(rawText: string): number[] {
  return [...normalizedText(rawText).matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g)].map((match) =>
    Number(match[1]),
  );
}

function hasConflictingRate(rawText: string, rate: number): boolean {
  const text = normalizedText(rawText);
  const rates = printedRates(text);
  return rates.length !== (text.match(/%/g)?.length ?? 0) || rates.some((value) => value !== rate);
}

/** 商品・割引だけの役割なら、名称中の税表記を独立した税内訳にしない。 */
function isItemOrDiscountOnly(line: ReceiptRawObservationLine): boolean {
  return (
    explicitSummaryLineKind(line.rawText) === undefined &&
    !line.lineRoleCandidates.some((role) => role === "tax" || role === "subtotal") &&
    line.lineRoleCandidates.some((role) => role === "item" || role === "discount")
  );
}

/** 明示的な対象額を優先し、税額の小計・合計は税額として扱う。 */
function explicitSummaryLineKind(rawText: string): "target" | "tax" | undefined {
  const text = normalizedText(rawText);
  const explicitTarget = /対象|タイショウ|課税売上/.test(text) && !/対象(?:消費)?税/.test(text);
  if (explicitTarget) return "target";
  if (/税額|消費税|内税|外税|\(内\)税|税計|税合計|tax/i.test(text)) return "tax";
  if (/小計/.test(text)) return "target";
  return undefined;
}

function taxSummaryLineKind(rawText: string): "target" | "tax" | undefined {
  const text = normalizedText(rawText);
  const explicitKind = explicitSummaryLineKind(text);
  if (explicitKind) return explicitKind;
  if (
    printedRates(text).some((rate) => [0, 8, 10].includes(rate)) &&
    /税込|税抜|税別|合計/.test(text)
  )
    return "target";
  return undefined;
}

/** 独立した印字税内訳がある場合だけ、全体選択によるサマリの置換を止める。 */
export function hasPrintedTaxSummaryEvidence(
  lines: ReceiptRawObservationLine[] | undefined,
): boolean {
  return (
    lines?.some((line) => {
      if (!line.explicitlyPrinted || isItemOrDiscountOnly(line)) return false;
      if (taxSummaryLineKind(line.rawText) !== undefined) return true;
      // 読み取れない税内訳や税率付き金額も独立した証拠として残す。
      return (
        line.lineRoleCandidates.some((role) => role === "tax" || role === "subtotal") ||
        (line.amountYen !== null && /%/.test(normalizedText(line.rawText)))
      );
    }) ?? false
  );
}

/** 原文の役割と税率を照合する。単一内訳に帰属できる対象額だけ税率省略を許す。 */
export function taxSummaryEvidenceLines(
  lines: ReceiptRawObservationLine[] | undefined,
  rate: number,
  kind: "target" | "tax",
  options: { singleSummary?: boolean } = {},
): ReceiptRawObservationLine[] {
  const independentLines = (lines ?? []).filter(
    (line) => line.explicitlyPrinted && !isItemOrDiscountOnly(line),
  );
  const canAssignRateLessTarget =
    kind === "target" &&
    options.singleSummary === true &&
    !independentLines.some((line) => hasConflictingRate(line.rawText, rate));
  return independentLines.filter((line) => {
    if (!Number.isSafeInteger(line.amountYen)) return false;
    const text = normalizedText(line.rawText);
    if (text.includes("%")) {
      if (hasConflictingRate(text, rate)) return false;
    } else if (!canAssignRateLessTarget) return false;
    return taxSummaryLineKind(text) === kind;
  });
}

/**
 * 対象額の出所が不明でも、独立した原文の合計・税額と全明細が一致する場合だけ更新する。
 * 直接印字された対象額、手修正、複数内訳、負の明細は既存の厳密照合へ委ねる。
 */
export function recalculateUnprovenSummary(args: {
  amountYen: number;
  items: ExtractedReceiptItem[];
  summaries: ExtractedTaxSummary[];
  lines?: ReceiptRawObservationLine[];
}): ExtractedTaxSummary[] {
  const { items, summaries, amountYen } = args;
  const lines = args.lines?.filter((line) => !isItemOrDiscountOnly(line));
  if (summaries.length !== 1 || items.length === 0 || !lines?.length) return summaries;
  const summary = summaries[0];
  if (summary.valueOrigin?.source === "user") return summaries;
  const rate = summary.taxRatePercent;
  const basis = items[0].amountBasis;
  if (
    rate === 0 ||
    basis === "unknown" ||
    items.some(
      (item) =>
        item.taxRatePercent !== rate ||
        item.amountBasis !== basis ||
        !Number.isSafeInteger(item.printedAmountYen) ||
        item.printedAmountYen <= 0,
    )
  )
    return summaries;
  // 税率が省略された対象額や小計も、帰属を断定せず補正を止める。
  if (lines.some((line) => line.explicitlyPrinted && taxSummaryLineKind(line.rawText) === "target"))
    return summaries;
  const taxLines = taxSummaryEvidenceLines(lines, rate, "tax");
  if (taxLines.length === 0 || taxLines.some((line) => line.amountYen !== summary.taxYen))
    return summaries;
  if (
    taxLines.some((line) => {
      const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
      return (
        (basis === "tax_included" && /外税|税抜|税別/.test(text)) ||
        (basis === "tax_excluded" && /内(?:消費)?税|税込|\(内\)税/.test(text))
      );
    })
  )
    return summaries;
  // 分類できない税率付き金額や、他税率・不明税率の印字を落とさない。
  if (
    lines.some(
      (line) =>
        line.explicitlyPrinted &&
        ((line.amountYen !== null &&
          normalizedText(line.rawText).includes("%") &&
          !taxLines.includes(line)) ||
          hasConflictingRate(line.rawText, rate)),
    )
  )
    return summaries;
  const totals = lines.filter(
    (line) =>
      line.explicitlyPrinted &&
      /^(?:合計|総合計|お?支払(?:い)?(?:合計|金額)?)/.test(
        line.rawText.normalize("NFKC").replace(/\s+/g, ""),
      ),
  );
  if (totals.length === 0 || totals.some((line) => line.amountYen !== amountYen)) return summaries;
  const target = items.reduce((sum, item) => sum + item.printedAmountYen, 0);
  const included = target + (basis === "tax_excluded" ? summary.taxYen : 0);
  const exactTax =
    basis === "tax_included" ? (target * rate) / (100 + rate) : (target * rate) / 100;
  // 既存の端数処理を尊重し、不明なら floor/round/ceil の範囲内だけを許す。
  const taxFits =
    summary.roundingMethod === "unknown"
      ? [Math.floor(exactTax), Math.ceil(exactTax)].includes(summary.taxYen)
      : Math[summary.roundingMethod](exactTax) === summary.taxYen;
  if (!Number.isSafeInteger(target) || included !== amountYen || !taxFits) return summaries;
  const recalculated = {
    taxableAmountYen: target,
    taxableAmountBasis: basis,
    taxMode: basis === "tax_included" ? "included" : "external",
    taxIncludedAmountYen: included,
  };
  // 対象額の出所と独立して、他フィールドの手修正も保存後まで保護する。
  if (
    summary.userEditedFields?.some(
      (field) =>
        field in recalculated &&
        summary[field] !== recalculated[field as keyof typeof recalculated],
    )
  )
    return summaries;
  if (
    summary.taxableAmountYen === target &&
    summary.taxableAmountBasis === basis &&
    summary.taxMode === (basis === "tax_included" ? "included" : "external")
  )
    return summaries;
  return [
    {
      ...summary,
      taxableAmountYen: target,
      taxableAmountBasis: basis,
      taxMode: basis === "tax_included" ? "included" : "external",
      taxIncludedAmountYen: included,
      valueOrigin: {
        source: "items",
        previousTaxableAmountYen:
          summary.valueOrigin?.previousTaxableAmountYen ?? summary.taxableAmountYen,
      },
    },
  ];
}
