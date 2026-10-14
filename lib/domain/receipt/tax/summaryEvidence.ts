import { isNonTaxEvidenceLine } from "./interpretTaxEvidence";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../observations";

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
  if (/小計|^(?:税抜|税別)(?:合計|総計)|^(?:合計|総計)\(?(?:税抜|税別)/.test(text)) return "target";
  return undefined;
}

export function taxSummaryLineKind(rawText: string): "target" | "tax" | undefined {
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

export function independentSummaryLines(
  lines: ReceiptRawObservationLine[] | undefined,
  classifications: ReceiptLineClassification[] | undefined,
): ReceiptRawObservationLine[] {
  const byIndex = new Map(classifications?.map((entry) => [entry.sourceLineIndex, entry]));
  return (lines ?? []).filter(
    (line) =>
      line.explicitlyPrinted &&
      !isItemOrDiscountOnly(line) &&
      !isNonTaxEvidenceLine(line, byIndex.get(line.sourceLineIndex)),
  );
}

export function isTaxRateDeclarationLine(line: ReceiptRawObservationLine): boolean {
  if (line.amountYen !== null || line.amountText?.trim()) return false;
  const match = /^(?:※)?(?:(?:消費|適用)?税率|taxrate)[:：]?\(?(\d+(?:\.\d+)?)%\)?$/i.exec(
    normalizedText(line.rawText),
  );
  return match !== null && [0, 8, 10].includes(Number(match[1]));
}

/** 独立した印字税内訳がある場合だけ、全体選択によるサマリの置換を止める。 */
export function hasPrintedTaxSummaryEvidence(
  lines: ReceiptRawObservationLine[] | undefined,
  classifications?: ReceiptLineClassification[],
): boolean {
  return independentSummaryLines(lines, classifications).some((line) => {
    // 金額のない明確な税率宣言だけを除き、読めない内税・外税は保護する。
    if (isTaxRateDeclarationLine(line)) return false;
    if (taxSummaryLineKind(line.rawText) !== undefined) return true;
    // 読み取れない税内訳や税率付き金額も独立した証拠として残す。
    return (
      line.lineRoleCandidates.some((role) => role === "tax" || role === "subtotal") ||
      (line.amountYen !== null && /%/.test(normalizedText(line.rawText)))
    );
  });
}

/** 原文の役割と税率を照合する。単一内訳に帰属できる対象額・税額だけ税率省略を許す。 */
export function taxSummaryEvidenceLines(
  lines: ReceiptRawObservationLine[] | undefined,
  rate: number,
  kind: "target" | "tax",
  options: {
    singleSummary?: boolean;
    classifications?: ReceiptLineClassification[];
    ignoreExemptRateForRateLess?: boolean;
  } = {},
): ReceiptRawObservationLine[] {
  const independentLines = independentSummaryLines(lines, options.classifications);
  const canAssignRateLessLine =
    options.singleSummary === true &&
    !independentLines.some((line) => {
      const text = normalizedText(line.rawText);
      const rates = printedRates(text);
      if (
        options.ignoreExemptRateForRateLess &&
        rate !== 0 &&
        rates.length > 0 &&
        rates.length === (text.match(/%/g)?.length ?? 0) &&
        rates.every((value) => value === 0)
      )
        return false;
      return hasConflictingRate(text, rate);
    });
  return independentLines.filter((line) => {
    if (!Number.isSafeInteger(line.amountYen)) return false;
    const text = normalizedText(line.rawText);
    if (text.includes("%")) {
      if (hasConflictingRate(text, rate)) return false;
    } else if (!canAssignRateLessLine) return false;
    return taxSummaryLineKind(text) === kind;
  });
}
