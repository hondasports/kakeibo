import type { ExtractedTaxSummary, InterpretedReceiptItem } from "./types";
import { matchTaxSummaryItems } from "./taxAmountBasis";

export function validateConsistency(args: {
  amountYen: number;
  items: InterpretedReceiptItem[];
  taxSummaries: ExtractedTaxSummary[];
}) {
  const warnings: string[] = [];
  args.items.forEach((item, index) => {
    if (item.taxContext.status === "unresolved") {
      if (item.taxRatePercent === null) warnings.push(`unresolved_tax_rate:items[${index}]`);
      if (item.amountBasis === "unknown") warnings.push(`unresolved_amount_basis:items[${index}]`);
    }
  });
  for (const summary of args.taxSummaries) {
    if (summary.status === "conflicting") continue;
    const sameRate = args.items.filter(
      (item) =>
        item.taxContext.status === "resolved" && item.taxRatePercent === summary.taxRatePercent,
    );
    if (sameRate.length === 0) {
      warnings.push(`missing_tax_items:${summary.taxRatePercent}`);
    } else if (!matchTaxSummaryItems(summary, sameRate)) {
      warnings.push(`taxable_amount_mismatch:${summary.taxRatePercent}`);
    }
  }
  if (args.items.reduce((sum, item) => sum + item.normalizedAmountYen, 0) !== args.amountYen) {
    warnings.push("normalized_amount_mismatch");
  }
  return warnings;
}
