import type { ReceiptRawObservationLine } from "../observations";
import type { ExtractedReceiptItem, ExtractedTaxSummary } from "./types";

/** 原文の役割と税率を照合する。数値の一致だけでは印字証拠にしない。 */
export function taxSummaryEvidenceLines(
  lines: ReceiptRawObservationLine[] | undefined,
  rate: number,
  kind: "target" | "tax",
): ReceiptRawObservationLine[] {
  return (lines ?? []).filter((line) => {
    if (!line.explicitlyPrinted || !Number.isSafeInteger(line.amountYen)) return false;
    const text = line.rawText.normalize("NFKC").replace(/\s+/g, "");
    const rateMatch = /(?<!\d)(0|8|10)%/.exec(text);
    if (!rateMatch || Number(rateMatch[1]) !== rate) return false;
    const target =
      /対象|タイショウ|小計|税込|税抜|税別|課税売上|合計/.test(text) && !/対象消費税/.test(text);
    return kind === "target" ? target : !target && /税額|消費税|内税|外税|\(内\)税/.test(text);
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
  const { items, summaries, lines, amountYen } = args;
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
  if (
    lines.some(
      (line) =>
        line.explicitlyPrinted && /対象|タイショウ|小\s*計/.test(line.rawText.normalize("NFKC")),
    )
  )
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
  // 税率付きの金額行を税額と確認できない場合、別の対象額証拠を落とさない。
  if (
    lines.some(
      (line) =>
        line.explicitlyPrinted &&
        line.amountYen !== null &&
        /(?<!\d)(?:0|8|10)\s*%/.test(line.rawText.normalize("NFKC")) &&
        !taxLines.includes(line),
    )
  )
    return summaries;
  // 他税率の印字を落とした単一内訳では自動確定しない。
  if (
    lines.some(
      (line) =>
        line.explicitlyPrinted &&
        /(?<!\d)(0|8|10)\s*%/.test(line.rawText.normalize("NFKC")) &&
        !new RegExp(`(?<!\\d)${rate}\\s*%`).test(line.rawText.normalize("NFKC")),
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
