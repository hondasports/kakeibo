import { EXPENSE_ENTRY_AMOUNT_MAX } from "../../expenseEntries/expenseEntryItem";
import { isDiscountLine, isValidSignedLineItemAmount } from "../discountItems";
import { allocateTax, findTaxRoundingCombinations } from "./normalizeAmounts";
import type { InterpretedReceiptItem, TaxRatePercent } from "./types";

type TaxBucket = {
  rate: TaxRatePercent;
  external: boolean;
  indexes: number[];
  printedTotal: number;
};

export type DraftItemTaxLink = {
  id?: string;
  discountTargetItemId?: string;
};

function groupLinkedDiscounts(
  indexes: number[],
  discountTargets: ReadonlyMap<number, number>,
): number[][] {
  const inBucket = new Set(indexes);
  const groups = new Map<number, number[]>();
  for (const index of indexes) {
    const target = discountTargets.get(index) ?? index;
    const key = inBucket.has(target) ? target : index;
    const group = groups.get(key) ?? [];
    group.push(index);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function allocateSignedTax(
  tax: number,
  amounts: number[],
  exactRate?: { numerator: bigint; denominator: bigint },
): number[] | undefined {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const sign = total < 0 ? -1 : 1;
  return allocateTax(
    sign * tax,
    Math.abs(total),
    amounts.map((amount) => sign * amount),
    exactRate,
  )?.map((amount) => (amount === 0 ? 0 : sign * amount));
}

export function calculateReceiptRegistrationItems(
  items: InterpretedReceiptItem[],
  paidTotal: number,
  links: readonly DraftItemTaxLink[],
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

  const productIndexes = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const id = links[index]?.id;
    if (id !== undefined && !isDiscountLine(item.itemName, item.lineType)) {
      productIndexes.set(id, index);
    }
  }
  const discountTargets = new Map<number, number>();
  for (const [index, item] of items.entries()) {
    const targetId = links[index]?.discountTargetItemId;
    if (
      targetId === undefined ||
      item.printedAmountYen >= 0 ||
      !isDiscountLine(item.itemName, item.lineType)
    )
      continue;
    const targetIndex = productIndexes.get(targetId);
    if (targetIndex !== undefined) discountTargets.set(index, targetIndex);
  }

  const result = [...items];
  for (const { rate, external, printedTotal, indexes } of buckets.values()) {
    const sign = printedTotal < 0 ? -1 : 1;
    const tax = external
      ? (externalTax.get(rate) ?? 0)
      : sign * Math.round((Math.abs(printedTotal) * rate) / (100 + rate));
    // 丸め済みの合計税額を按分比率にすると、商品と割引の相殺時に明細の税率から外れる。
    const rateForAdjustments = indexes.some((index) => items[index].printedAmountYen < 0)
      ? { numerator: BigInt(rate), denominator: BigInt(external ? 100 : 100 + rate) }
      : undefined;
    const groups = groupLinkedDiscounts(indexes, discountTargets);
    const groupAmounts = groups.map((group) =>
      group.reduce((sum, index) => sum + items[index].printedAmountYen, 0),
    );
    const groupTaxes = allocateSignedTax(tax, groupAmounts, rateForAdjustments);
    if (!groupTaxes) return undefined;
    for (const [groupIndex, group] of groups.entries()) {
      const amounts = group.map((index) => items[index].printedAmountYen);
      const allocations =
        group.length === 1
          ? [groupTaxes[groupIndex]]
          : allocateSignedTax(groupTaxes[groupIndex], amounts, rateForAdjustments);
      if (!allocations) return undefined;
      for (const [index, itemIndex] of group.entries()) {
        const allocatedTaxYen = allocations[index];
        const amountYen = amounts[index] + (external ? allocatedTaxYen : 0);
        if (Math.abs(amountYen) > EXPENSE_ENTRY_AMOUNT_MAX) return undefined;
        result[itemIndex] = {
          ...items[itemIndex],
          allocatedTaxYen,
          normalizedAmountYen: amountYen,
          taxAllocationStatus: "allocated",
        };
      }
    }
  }
  return result;
}
