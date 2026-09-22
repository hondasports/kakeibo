import { describe, expect, it } from "vitest";
import { unallocatedTaxReceipt } from "./fixtures/unallocatedTaxReceipt";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { buildAmountCheck } from "../../../../src/features/receipt-review/utils/reviewChecks";
import type { ReviewItemValues } from "../../../../src/features/receipt-review/types/types";
import type { ReinterpretDraftTaxInput } from "./reinterpretDraftTax";
const reviewItems = (
  fields: ReturnType<typeof reinterpretDraftTax>["itemFields"],
): ReviewItemValues[] =>
  fields.map((field, index) => ({
    ...field,
    id: String(index),
    itemName: "明細" + index,
    categoryId: "cat",
    amountYen: String(field.printedAmountYen),
  }));
const amountCheck = (input: ReinterpretDraftTaxInput) =>
  buildAmountCheck({
    items: reviewItems(reinterpretDraftTax(input).itemFields),
    paidTotalYen: 4662,
    taxSummaries: input.taxSummaries,
  });
describe("#748 配分未完了と真の0円", () => {
  it("旧0円データ→税内訳だけ修正→割引修正で4662/370/0になる", () => {
    const input = unallocatedTaxReceipt();
    const initial = reinterpretDraftTax(input);
    expect(initial.itemFields[0].taxAllocationStatus).toBe("unallocated");
    expect(amountCheck(input)).toMatchObject({
      status: "matched",
      variant: "external",
      itemsPrintedTotalYen: 4292,
      printedSubtotalYen: 4292,
      printedTaxYen: 370,
    });
    // 未配分の税抜明細があるため税込換算の合計は確定しない
    expect(amountCheck(input).itemsComparableTotalYen).toBeUndefined();
    input.taxSummaries = input.taxSummaries.map((s) => ({
      ...s,
      taxableAmountBasis: "tax_excluded",
    }));
    const partial = reinterpretDraftTax(input);
    expect(partial.itemFields[11]).toMatchObject({
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 138,
      normalizedAmountYen: 1518,
    });
    expect(partial.itemFields[0].taxAllocationStatus).toBe("unallocated");
    input.items[7].taxRatePercent = 8;
    input.items[8].taxRatePercent = 8;
    const complete = reinterpretDraftTax(input);
    expect(complete.itemFields.every((i) => i.taxAllocationStatus === "allocated")).toBe(true);
    expect(amountCheck(input)).toMatchObject({
      status: "matched",
      variant: "external",
      itemsPrintedTotalYen: 4292,
      itemsComparableTotalYen: 4662,
      printedTaxYen: 370,
    });
    const again = reinterpretDraftTax({
      ...input,
      items: complete.itemFields.map((i, index) => ({
        ...i,
        itemName: input.items[index].itemName,
      })),
    });
    expect(again.itemFields).toEqual(complete.itemFields);
  });
  it("非課税・端数で配分0円でも確定として扱う", () => {
    const input = unallocatedTaxReceipt();
    input.amountYen = 1;
    input.items = [
      { itemName: "小額商品", printedAmountYen: 1, amountBasis: "tax_excluded", taxRatePercent: 8 },
    ];
    input.taxSummaries = [
      {
        ...input.taxSummaries[0],
        taxableAmountYen: 1,
        taxableAmountBasis: "tax_excluded",
        taxYen: 0,
      },
    ];
    expect(reinterpretDraftTax(input).itemFields[0]).toMatchObject({
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 0,
      normalizedAmountYen: 1,
    });
    input.items[0].taxRatePercent = 0;
    input.taxSummaries = [];
    expect(reinterpretDraftTax(input).itemFields[0]).toMatchObject({
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 0,
      normalizedAmountYen: 1,
    });
  });
});
