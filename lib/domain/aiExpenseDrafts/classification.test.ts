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

describe("AI expense draft classification", () => {
  it("主要項目と信頼度が十分なレシート下書きを登録準備OKに分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        categoryId: "category-food",
        confidence: {
          documentType: 0.92,
          shopName: 0.91,
          date: 0.93,
          amountYen: 0.96,
          categoryId: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "ready",
      reviewReasons: [],
    });
  });

  it("必須項目が不足する下書きを確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "   ",
        date: "",
        amountYen: 0,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["missing_required_field"],
    });
  });

  it("カテゴリ候補がない下書きを確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["ambiguous_category"],
    });
  });

  it("主要フィールドの信頼度がしきい値未満なら確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.79,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["low_confidence"],
    });
  });

  it("AI警告がある下書きを確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: ["日付の印字が薄い"],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["low_confidence"],
    });
  });

  it("書類種別が不明な下書きを確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "unknown",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["ambiguous_document_type"],
    });
  });

  it("コンビニ払込票で支払先または支払内容が不明なら確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "convenience_payment",
        paymentPlace: "セブンイレブン",
        payeeName: "東京都",
        date: "2026-06-01",
        amountYen: 39500,
        categoryId: "category-tax",
        confidence: {
          documentType: 0.9,
          paymentPlace: 0.9,
          payeeName: 0.9,
          paymentPurpose: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["missing_required_field"],
    });
  });

  it("明細合計の検証は分類で行わない", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-01",
        amountYen: 1200,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
        items: [
          {
            itemName: "パン",
            amountYen: 500,
            categoryId: "category-food",
          },
          {
            itemName: "牛乳",
            amountYen: 600,
            categoryId: "category-food",
          },
        ],
      }),
    ).toEqual({
      status: "ready",
      reviewReasons: [],
    });
  });

  it("カテゴリ未確定の明細がある場合は確認が必要に分類する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "ドラッグストアA",
        date: "2026-06-21",
        amountYen: 1380,
        categoryId: "category-daily",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
        items: [
          {
            itemName: "パン",
            amountYen: 400,
            categoryId: "category-food",
          },
          {
            itemName: "胃薬",
            amountYen: 980,
          },
        ],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["ambiguous_category"],
    });
  });

  it("複数カテゴリの明細はユーザー確認が必要に分類する", () => {
    const input = {
      documentType: "receipt" as const,
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1380,
      categoryId: "category-daily",
      confidence: {
        documentType: 0.9,
        shopName: 0.9,
        date: 0.9,
        amountYen: 0.9,
        categoryId: 0.9,
      },
      warnings: [],
      items: [
        { itemName: "食品", amountYen: 400, categoryId: "category-food" },
        { itemName: "日用品", amountYen: 980, categoryId: "category-daily" },
      ],
    };

    expect(classifyAiExpenseDraft(input)).toEqual({
      status: "needs_review",
      reviewReasons: ["multiple_categories"],
    });
    expect(classifyAiExpenseDraft({ ...input, multiCategoryConfirmed: true })).toEqual({
      status: "ready",
      reviewReasons: [],
    });
  });

  it("カテゴリの判定は金額の判定と独立する", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "ドラッグストアA",
        date: "2026-06-21",
        amountYen: 100,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
        items: [
          { itemName: "パン", amountYen: 200, categoryId: "category-food" },
          { itemName: "日用品", amountYen: 100, categoryId: "category-daily" },
          { itemName: "クーポン券割引", amountYen: -200, categoryId: "category-daily" },
        ],
      }),
    ).toEqual({
      status: "needs_review",
      reviewReasons: ["multiple_categories"],
    });
  });

  it("0円明細の検証は分類で行わない", () => {
    expect(
      classifyAiExpenseDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        date: "2026-06-21",
        amountYen: 100,
        categoryId: "category-food",
        confidence: {
          documentType: 0.9,
          shopName: 0.9,
          date: 0.9,
          amountYen: 0.9,
          categoryId: 0.9,
        },
        warnings: [],
        items: [
          { itemName: "パン", amountYen: 100, categoryId: "category-food" },
          { itemName: "不明な明細", amountYen: 0, categoryId: "category-food" },
        ],
      }),
    ).toEqual({
      status: "ready",
      reviewReasons: [],
    });
  });
});
