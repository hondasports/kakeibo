import { describe, expect, it } from "vitest";
import { classifyAiExpenseDraft, classifyCreatedDraft } from "./classification";

const completeDraft = {
  documentType: "receipt" as const,
  shopName: "マルアイ",
  date: "2026-08-16",
  amountYen: 90,
  categoryId: "food",
  confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
  warnings: [] as string[],
};

describe("classifyAiExpenseDraft signed items", () => {
  it("明示された販促調整の負額を有効な明細として扱う", () => {
    const result = classifyAiExpenseDraft({
      ...completeDraft,
      items: [
        { itemName: "商品", amountYen: 100, categoryId: "food", lineType: "item" },
        {
          itemName: "M001 東洋水産よりどり",
          amountYen: -10,
          categoryId: "food",
          lineType: "promotion_adjustment",
        },
      ],
    });
    expect(result.reviewReasons).not.toContain("amount_mismatch");
  });

  it("明細金額の判定は分類では行わない", () => {
    for (const lineType of ["item", "unknown"] as const) {
      const result = classifyAiExpenseDraft({
        ...completeDraft,
        items: [
          { itemName: "商品", amountYen: 100, categoryId: "food", lineType: "item" },
          { itemName: "不明な負額", amountYen: -10, categoryId: "food", lineType },
        ],
      });
      expect(result).toMatchObject({ status: "ready" });
      expect(result.reviewReasons).not.toContain("amount_mismatch");
    }
  });
});

describe("classifyCreatedDraft", () => {
  it("画像解析直後は user_confirmation_required を付与して needs_review とする", () => {
    const result = classifyCreatedDraft({
      documentType: "receipt",
      shopName: "コンビニ",
      date: "2026-08-07",
      amountYen: 1000,
      confidence: {
        documentType: 0.99,
        shopName: 0.99,
        date: 0.99,
        amountYen: 0.99,
        categoryId: 0.99,
      },
      warnings: [],
    });
    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toContain("user_confirmation_required");
  });

  it("既存の reviewReasons をマージする", () => {
    const result = classifyCreatedDraft({
      documentType: "unknown",
      confidence: {
        documentType: 0.3,
        shopName: 0.99,
        date: 0.99,
        amountYen: 0.99,
        categoryId: 0.99,
      },
      warnings: [],
      reviewReasons: ["amount_mismatch"],
    });
    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons).toContain("user_confirmation_required");
    expect(result.reviewReasons).toContain("amount_mismatch");
    expect(result.reviewReasons).toContain("ambiguous_document_type");
  });
});
