import { resolveAmountBasis } from "./resolveAmountBasis";
import type {
  AmountBasis,
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  ResolvedAmountBasis,
} from "./types";

type SummaryAmounts = Pick<
  ExtractedTaxSummary,
  | "taxRatePercent"
  | "taxMode"
  | "taxableAmountBasis"
  | "taxableAmountYen"
  | "taxYen"
  | "taxIncludedAmountYen"
>;

/** 印字税額で対象額の基準を換算する。宣言・算術が矛盾する証拠は換算しない。 */
export function taxSummaryAmountInBasis(
  summary: SummaryAmounts,
  basis: AmountBasis,
): number | undefined {
  const sourceBasis = resolveAmountBasis(summary);
  if (sourceBasis === "unknown" || basis === "unknown" || summary.taxMode === "mixed")
    return undefined;
  if (
    (summary.taxMode === "included" && sourceBasis !== "tax_included") ||
    (summary.taxMode === "external" && sourceBasis !== "tax_excluded")
  )
    return undefined;
  if (
    !Number.isSafeInteger(summary.taxableAmountYen) ||
    !Number.isSafeInteger(summary.taxYen) ||
    summary.taxYen < 0
  )
    return undefined;
  const excluded = summary.taxableAmountYen - (sourceBasis === "tax_included" ? summary.taxYen : 0);
  const included = excluded + summary.taxYen;
  if (
    excluded < 0 ||
    !Number.isSafeInteger(included) ||
    (summary.taxIncludedAmountYen !== undefined && summary.taxIncludedAmountYen !== included)
  )
    return undefined;
  return basis === "tax_included" ? included : excluded;
}

/** 同一税率の税込・税抜表記が同じ対象額・印字税額を表すかを厳密に照合する。 */
export function equivalentTaxSummaryAmounts(left: SummaryAmounts, right: SummaryAmounts): boolean {
  const leftIncluded = taxSummaryAmountInBasis(left, "tax_included");
  return (
    left.taxRatePercent === right.taxRatePercent &&
    left.taxYen === right.taxYen &&
    leftIncluded !== undefined &&
    leftIncluded === taxSummaryAmountInBasis(right, "tax_included")
  );
}

/** 計算用の内訳だけを重複排除する。呼出側は印字証拠の元配列を保持する。 */
export function distinctTaxSummaryAmounts<T extends SummaryAmounts>(summaries: T[]): T[] {
  return summaries.filter(
    (summary, index) =>
      !summaries.slice(0, index).some((previous) => equivalentTaxSummaryAmounts(previous, summary)),
  );
}

/** 確定済みの同一基準の明細だけを換算対象額と照合し、金額から区分を推定しない。 */
export function matchTaxSummaryItems(
  summary: SummaryAmounts,
  items: Pick<ExtractedReceiptItem, "amountBasis" | "printedAmountYen">[],
): { amountBasis: ResolvedAmountBasis; printedTotalYen: number } | undefined {
  const basis = items[0]?.amountBasis;
  if (
    !basis ||
    basis === "unknown" ||
    items.some((item) => item.amountBasis !== basis || !Number.isSafeInteger(item.printedAmountYen))
  )
    return undefined;
  const printedTotalYen = items.reduce((sum, item) => sum + item.printedAmountYen, 0);
  if (printedTotalYen !== taxSummaryAmountInBasis(summary, basis)) return undefined;
  return { amountBasis: basis, printedTotalYen };
}
