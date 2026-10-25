import type {
  ExtractedReceiptItem,
  ExtractedTaxSummary,
  InterpretedReceiptItem,
  TaxContextResolution,
} from "./types";
import { matchTaxSummaryItems } from "./taxAmountBasis";
import { EXPENSE_ENTRY_AMOUNT_MAX } from "../../expenseEntries/expenseEntryItem";

export function allocateTax(
  taxYen: number,
  taxableAmountYen: number,
  amounts: number[],
): number[] | undefined {
  if (amounts.length === 0) return [];
  if (
    !Number.isInteger(taxYen) ||
    taxYen < 0 ||
    taxYen > EXPENSE_ENTRY_AMOUNT_MAX ||
    !Number.isInteger(taxableAmountYen) ||
    taxableAmountYen < 0 ||
    taxableAmountYen > EXPENSE_ENTRY_AMOUNT_MAX ||
    amounts.some(
      (amount) => !Number.isInteger(amount) || Math.abs(amount) > EXPENSE_ENTRY_AMOUNT_MAX,
    )
  ) {
    return undefined;
  }
  const total = BigInt(taxableAmountYen);
  if (amounts.reduce((sum, amount) => sum + BigInt(amount), 0n) !== total) return undefined;
  if (total === 0n) return taxYen === 0 ? amounts.map(() => 0) : undefined;
  const tax = BigInt(taxYen);
  const shares = amounts.map((amount, index) => {
    const product = BigInt(amount) * tax;
    const fraction = ((product % total) + total) % total;
    const base = (product - fraction) / total;
    return { index, base, fraction };
  });
  const remaining = Number(tax - shares.reduce((sum, share) => sum + share.base, 0n));
  if (remaining < 0 || remaining >= shares.length) return undefined;
  const order = [...shares].sort((a, b) =>
    a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1,
  );
  for (let index = 0; index < remaining; index += 1) order[index].base += 1n;
  const allocations = shares.map((share) => Number(share.base));
  if (allocations.some((amount) => Math.abs(amount) > EXPENSE_ENTRY_AMOUNT_MAX)) return undefined;
  return allocations;
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
  const allocatedRates = new Set<number>();
  for (const summary of args.taxSummaries) {
    if (allocatedRates.has(summary.taxRatePercent)) continue;
    if (
      summary.status !== undefined &&
      summary.status !== "verified" &&
      summary.status !== "coherent"
    ) {
      continue;
    }
    const indexes = result
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.taxRatePercent === summary.taxRatePercent)
      .map(({ index }) => index);
    if (indexes.some((index) => result[index].taxContext.status !== "resolved")) continue;
    const match = matchTaxSummaryItems(
      summary,
      indexes.map((index) => result[index]),
    );
    if (match) {
      const allocations = allocateTax(
        summary.taxYen,
        match.printedTotalYen,
        indexes.map((index) => result[index].printedAmountYen),
      );
      if (!allocations) continue;
      allocatedRates.add(summary.taxRatePercent);
      indexes.forEach((itemIndex, allocationIndex) => {
        result[itemIndex].allocatedTaxYen = allocations[allocationIndex];
        result[itemIndex].taxAllocationStatus = "allocated";
        result[itemIndex].normalizedAmountYen =
          result[itemIndex].printedAmountYen +
          (match.amountBasis === "tax_excluded" ? allocations[allocationIndex] : 0);
      });
    }
  }
  return result;
}
