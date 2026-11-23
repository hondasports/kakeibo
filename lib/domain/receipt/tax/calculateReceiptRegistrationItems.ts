import { EXPENSE_ENTRY_AMOUNT_MAX } from "../../expenseEntries/expenseEntryItem";
import { isValidSignedLineItemAmount } from "../discountItems";
import { allocateTax, findTaxRoundingCombinations } from "./normalizeAmounts";
import type { InterpretedReceiptItem, TaxRatePercent } from "./types";

type TaxBucket = {
  rate: TaxRatePercent;
  external: boolean;
  indexes: number[];
  printedTotal: number;
};

export function calculateReceiptRegistrationItems(
  items: InterpretedReceiptItem[],
  paidTotal: number,
): InterpretedReceiptItem[] | undefined {
  const buckets = new Map<string, TaxBucket>();
  for (const [index, item] of items.entries()) {
    const context = item.taxContext;
    const amount = item.printedAmountYen;
    if (
      context.status !== "resolved" ||
      !isValidSignedLineItemAmount(item.itemName, amount, item.lineType) ||
      Math.abs(amount) > EXPENSE_ENTRY_AMOUNT_MAX
    ) {
      return undefined;
    }
    const { taxRatePercent: rate, amountBasis } = context;
    const key = `${rate}:${amountBasis}`;
    const bucket = buckets.get(key) ?? {
      rate,
      external: amountBasis === "tax_excluded",
      indexes: [],
      printedTotal: 0,
    };
    bucket.indexes.push(index);
    bucket.printedTotal += amount;
    buckets.set(key, bucket);
  }

  const externalBuckets = [...buckets.values()].filter(
    ({ external, rate }) => external && rate > 0,
  );
  const printedTotal = items.reduce((sum, item) => sum + item.printedAmountYen, 0);
  const externalTax = new Map<TaxRatePercent, number>();
  if (externalBuckets.length === 0 && paidTotal !== printedTotal) return undefined;
  if (externalBuckets.length > 0) {
    const combinations = findTaxRoundingCombinations(
      externalBuckets.map(({ rate, printedTotal }) => (printedTotal * rate) / 100),
      paidTotal - printedTotal,
    );
    if (combinations.length !== 1) return undefined;
    externalBuckets.forEach(({ rate }, index) => externalTax.set(rate, combinations[0][index]));
  }

  const result = [...items];
  for (const { rate, external, printedTotal, indexes } of buckets.values()) {
    const tax = external
      ? (externalTax.get(rate) ?? 0)
      : Math.round((printedTotal * rate) / (100 + rate));
    const amounts = indexes.map((index) => items[index].printedAmountYen);
    const allocation = allocateTax(tax, printedTotal, amounts);
    if (!allocation) return undefined;
    for (const [index, itemIndex] of indexes.entries()) {
      const amountYen = amounts[index] + (external ? allocation[index] : 0);
      if (Math.abs(amountYen) > EXPENSE_ENTRY_AMOUNT_MAX) return undefined;
      result[itemIndex] = {
        ...items[itemIndex],
        allocatedTaxYen: allocation[index],
        normalizedAmountYen: amountYen,
        taxAllocationStatus: "allocated",
      };
    }
  }
  return result;
}
