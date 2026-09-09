import type {
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  InterpretedReceiptItem,
  TaxContextResolution,
} from "./types";
import { resolveAmountBasis } from "./resolveAmountBasis";

export function allocateTax(taxYen: number, taxableAmountYen: number, amounts: number[]) {
  if (amounts.length === 0 || taxableAmountYen === 0) return amounts.map(() => 0);
  const shares = amounts.map((amount, index) => {
    const exact = (amount * taxYen) / taxableAmountYen;
    const base = Math.floor(exact);
    return { index, base, fraction: exact - base };
  });
  let remaining = taxYen - shares.reduce((sum, share) => sum + share.base, 0);
  const order = [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) order[index % order.length].base += 1;
  return shares.map((share) => share.base);
}

export function normalizeAmounts(args: {
  amountYen: number;
  items: ExtractedReceiptItem[];
  contexts: TaxContextResolution[];
  taxSummaries: ExtractedTaxSummary[];
}): InterpretedReceiptItem[] {
  const result: InterpretedReceiptItem[] = args.items.map((item, index) => {
    const context = args.contexts[index];
    const contextWarnings = context.status === "unresolved" ? context.reasons : [];
    return {
      ...item,
      taxRatePercent: context.taxRatePercent,
      amountBasis: context.amountBasis,
      taxContext: context,
      warnings: [...new Set([...item.warnings, ...contextWarnings])],
      allocatedTaxYen: 0,
      taxAllocationStatus:
        context.status === "resolved" && context.taxRatePercent === 0 ? "allocated" : "unallocated",
      normalizedAmountYen: item.printedAmountYen,
    } satisfies InterpretedReceiptItem;
  });
  for (const summary of args.taxSummaries) {
    if (
      summary.status !== undefined &&
      summary.status !== "verified" &&
      summary.status !== "coherent"
    ) {
      continue;
    }
    const amountBasis = resolveAmountBasis(summary);
    if (amountBasis === "unknown") continue;
    const indexes = result
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.taxContext.status === "resolved" &&
          item.taxRatePercent === summary.taxRatePercent &&
          item.amountBasis === amountBasis,
      )
      .map(({ index }) => index);
    const printedTotal = indexes.reduce((sum, index) => sum + result[index].printedAmountYen, 0);
    if (indexes.length === 0) continue;

    if (printedTotal === summary.taxableAmountYen) {
      const allocations = allocateTax(
        summary.taxYen,
        summary.taxableAmountYen,
        indexes.map((index) => result[index].printedAmountYen),
      );
      indexes.forEach((itemIndex, allocationIndex) => {
        result[itemIndex].allocatedTaxYen = allocations[allocationIndex];
        result[itemIndex].taxAllocationStatus = "allocated";
        if (result[itemIndex].amountBasis === "tax_excluded") {
          result[itemIndex].normalizedAmountYen += allocations[allocationIndex];
        }
      });
    }
  }
  return result;
}
