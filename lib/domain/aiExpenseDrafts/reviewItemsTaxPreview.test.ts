import { describe, expect, it } from "vitest";
import {
  unprovenTargetReceipt,
  observationLine,
} from "../receipt/tax/fixtures/unprovenTargetReceipt";
import { buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { buildReviewChecks } from "./reviewChecks";
import type { ReinterpretDraftTaxInput } from "../receipt/tax/reinterpretDraftTax";
import type { ReviewItemValues } from "./reviewTypes";

function preview(input: ReinterpretDraftTaxInput) {
  const items: ReviewItemValues[] = input.items.map((item, index) => ({
    ...item,
    id: String(index),
    itemName: item.itemName,
    categoryId: "category",
    amountYen: String(item.printedAmountYen),
  }));
  return buildReviewTaxPreview(items, {
    paidTotalYen: input.amountYen,
    taxSummaries: input.taxSummaries,
    sourceTaxSummaries: input.sourceTaxSummaries,
    rawObservation: input.rawObservationLines
      ? { source: "ai_ocr", observedAt: 0, lines: input.rawObservationLines }
      : undefined,
    receiptLineClassifications: input.receiptLineClassifications,
    priceTaxTreatment: input.decisionOverride?.priceTaxTreatment,
    taxRateComposition: input.decisionOverride?.taxRateComposition,
  });
}

describe("明細から導出する画面の税計算", () => {
  it("小計付きの実再現で商品修正だけで合計と税額が一致する", () => {
    const input = unprovenTargetReceipt();
    const result = preview(input);
    expect(result.taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
    });
    expect(result.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(buildReviewChecks({ ...result, paidTotalYen: 4810 }).taxRate.status).toBe("matched");
    expect(input.taxSummaries[0].taxableAmountYen).toBe(4373);
  });

  it("保存済みの内部対象額と税額の変更は原文の証拠を置き換えない", () => {
    const input = unprovenTargetReceipt();
    input.taxSummaries[0] = {
      ...input.taxSummaries[0],
      taxableAmountYen: 1,
      taxYen: 999,
      valueOrigin: { source: "items" },
    };
    expect(preview(input).taxSummaries[0]).toMatchObject({
      taxableAmountYen: 4810,
      taxYen: 437,
      status: "verified",
    });
  });

  it("再表示で元の抽出証拠を保持し、計算結果を正の入力に戻さない", () => {
    const input = unprovenTargetReceipt();
    const first = preview(input);
    const reopened = preview({
      ...input,
      taxSummaries: first.taxSummaries.map((summary) => ({ ...summary, confidence: {} })),
    });
    expect(reopened.items).toEqual(first.items);
    expect(reopened.taxSummaries).toEqual(first.taxSummaries);
  });

  it.each(["10%対象4,373円", "10%税込4,373円", "内消費税10%999円"])(
    "%s が本当に印字されていたら未配分を残す",
    (text) => {
      const input = unprovenTargetReceipt();
      input.rawObservationLines!.push(observationLine(text, text.includes("999") ? 999 : 4373, 3));
      const result = preview(input);
      expect(result.items.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
      expect(buildReviewChecks({ ...result, paidTotalYen: 4810 }).taxRate.status).not.toBe(
        "matched",
      );
    },
  );

  it.each(["payment", "change"] as const)("%s の税額らしい行を根拠にしない", (role) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines![1].lineRoleCandidates = [role];
    expect(preview(input).items.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it("構造分類で決済と判定された行も税額へ流用しない", () => {
    const input = unprovenTargetReceipt();
    input.receiptLineClassifications = [
      {
        sourceLineIndex: 1,
        status: "classified",
        candidates: [{ role: "paymentMethodAmount", score: 1, evidence: [] }],
      },
    ];
    expect(preview(input).items.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });

  it("金額欄が空なら過去の計算結果があっても比較不能になる", () => {
    const result = preview(unprovenTargetReceipt());
    result.items[0].amountYen = "";
    expect(buildReviewChecks({ ...result, paidTotalYen: 4810 }).amount.status).toBe("uncomparable");
  });

  it("商品から確定した税区分は古いunknownの内部宣言に拘束されない", () => {
    const input = unprovenTargetReceipt();
    input.taxSummaries[0].taxMode = "unknown";
    input.taxSummaries[0].taxableAmountBasis = "unknown";
    expect(preview(input).items.every((item) => item.taxAllocationStatus === "allocated")).toBe(
      true,
    );
  });

  it("未確定の割引を含む場合は金額比較の警告を残す", () => {
    const input = unprovenTargetReceipt();
    input.items.push({
      ...input.items[0],
      itemName: "割引",
      printedAmountYen: -110,
      taxRatePercent: null,
      amountBasis: "unknown",
    });
    const result = preview(input);
    expect(buildReviewChecks({ ...result, paidTotalYen: 4810 }).taxRate.status).not.toBe("matched");
  });

  it("根拠のない古い登録額だけから税額を確定しない", () => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = undefined;
    input.taxSummaries = [];
    input.items = input.items.map((item) => ({ ...item, taxResolutionSource: "single_summary" }));
    expect(preview(input).items.some((item) => item.taxAllocationStatus === "unallocated")).toBe(
      true,
    );
  });
});
