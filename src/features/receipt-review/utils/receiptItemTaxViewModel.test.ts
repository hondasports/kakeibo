import { describe, expect, it } from "vitest";
import { toReceiptAnalysisViewModel, toReceiptItemTaxViewModel } from "./receiptItemTaxViewModel";
import type { ReviewItemValues } from "../types/types";

describe("toReceiptItemTaxViewModel", () => {
  it("keeps printed and normalized amounts distinct", () => {
    const vm = toReceiptItemTaxViewModel({
      id: "1",
      itemName: "item",
      amountYen: "322",
      categoryId: "cat",
      printedAmountYen: 298,
      allocatedTaxYen: 24,
      normalizedAmountYen: 322,
      taxResolutionStatus: "resolved",
      taxAllocationStatus: "allocated",
      taxResolutionSource: "single_summary",
      taxRatePercent: 8,
      amountBasis: "tax_excluded",
    });

    expect(vm.printedAmountLabel).toBe("298円");
    expect(vm.normalizedAmountLabel).toBe("322円");
    expect(vm.taxRateLabel).toBe("8%");
    expect(vm.amountBasisLabel).toBe("税抜");
    expect(vm.resolutionReasonLabel).toBe("レシート小計と商品合計が一致しました");
  });

  it("shows unset tax rate label for null", () => {
    const vm = toReceiptItemTaxViewModel({
      id: "1",
      itemName: "item",
      amountYen: "100",
      categoryId: "cat",
      taxRatePercent: null,
      taxResolutionStatus: "unresolved",
      taxReviewReasons: ["unresolved_tax_rate"],
      amountBasis: "unknown",
    });

    expect(vm.taxRateLabel).toBe("未設定");
    expect(vm.status).toBe("unresolved");
    expect(vm.reviewReasonLabels[0]).toBe("税率を判定できませんでした");
  });

  it("uses fallback for unknown review reason codes", () => {
    const vm = toReceiptItemTaxViewModel({
      id: "1",
      itemName: "item",
      amountYen: "100",
      categoryId: "cat",
      taxResolutionStatus: "unresolved",
      taxReviewReasons: ["custom_unknown_reason"],
      amountBasis: "unknown",
    });

    expect(vm.reviewReasonLabels[0]).toBe("分析結果に確認が必要な項目があります");
  });
});

describe("toReceiptAnalysisViewModel", () => {
  const baseItem: ReviewItemValues = {
    id: "1",
    itemName: "item",
    amountYen: "100",
    categoryId: "cat",
    normalizedAmountYen: 100,
    taxResolutionStatus: "resolved",
    taxAllocationStatus: "allocated",
    taxResolutionSource: "single_summary",
    taxRatePercent: 8,
    amountBasis: "tax_included",
  };

  it("marks needs_review when unresolved items exist", () => {
    const analysis = toReceiptAnalysisViewModel({
      reviewItems: [
        baseItem,
        { ...baseItem, id: "2", taxResolutionStatus: "unresolved", taxRatePercent: null },
      ],
      paidTotalYen: 200,
    });

    expect(analysis.status).toBe("needs_review");
    expect(analysis.unresolvedCount).toBe(1);
  });
});
