import { isValidCalendarDate } from "../common/date";
import { getCurrentYear } from "../common/year";

export type ReceiptDateError = "no_candidate" | "ambiguous" | "range_expression" | "invalid";

const RANGE_EXPRESSION_PATTERN = /[~〜～]|から|まで/;

const DATE_PATTERNS = [
  /(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g,
  /(?<!\d)(\d{4})\.(\d{1,2})\.(\d{1,2})(?!\d)/g,
  /(?<!\d)(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?!\d)/g,
  /(?<!\d)(\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?!\d)/g,
];

export function isPlausibleReceiptYear(
  year: number,
  referenceYear = Number(getCurrentYear()),
): boolean {
  return year >= 1 && year <= referenceYear + 1;
}

/** レシート等の OCR テキストから日付を抽出し、YYYY-MM-DD 形式に正規化する。 */
export function normalizeReceiptDate(
  value: string,
): { success: true; date: string } | { success: false; error: ReceiptDateError } {
  const normalized = value.normalize("NFKC").trim();
  if (normalized === "") {
    return { success: false, error: "no_candidate" };
  }
  if (RANGE_EXPRESSION_PATTERN.test(normalized)) {
    return { success: false, error: "range_expression" };
  }

  const candidates = findDateCandidates(normalized);
  if (candidates.length !== 1) {
    return { success: false, error: candidates.length === 0 ? "no_candidate" : "ambiguous" };
  }

  const { year, month, day } = candidates[0];
  if (!isPlausibleReceiptYear(year) || !isValidCalendarDate(year, month, day)) {
    return { success: false, error: "invalid" };
  }

  return {
    success: true,
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function findDateCandidates(value: string): Array<{ year: number; month: number; day: number }> {
  const candidates: Array<{ year: number; month: number; day: number }> = [];
  for (const pattern of DATE_PATTERNS) {
    for (const match of value.matchAll(pattern)) {
      const parsedYear = Number(match[1]);
      candidates.push({
        year: match[1].length === 2 ? 2000 + parsedYear : parsedYear,
        month: Number(match[2]),
        day: Number(match[3]),
      });
    }
  }
  return candidates;
}
