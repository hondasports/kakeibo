import { expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { receipt1224 } from "./fixtures/receipt1224";

it("0%対象額だけの印字でも8%明細に税抜の税額を配分する", () => {
  const result = reinterpretDraftTax(receipt1224() as never);
  expect(result.itemFields.slice(0, 5).map((item) => item.amountBasis)).toEqual(
    Array(5).fill("tax_excluded"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.taxAllocationStatus)).toEqual(
    Array(5).fill("allocated"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.allocatedTaxYen)).toEqual([
    13, 12, 11, 13, 13,
  ]);
});

it("0%の印字対象額がサマリと異なる場合は8%明細を自動補完しない", () => {
  const result = reinterpretDraftTax(receipt1224(101) as never);
  expect(result.itemFields.slice(0, 5).map((item) => item.amountBasis)).toEqual(
    Array(5).fill("unknown"),
  );
  expect(result.itemFields.slice(0, 5).map((item) => item.taxAllocationStatus)).toEqual(
    Array(5).fill("unallocated"),
  );
});
