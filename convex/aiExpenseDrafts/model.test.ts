import { describe, expect, it } from "vitest";
import {
  AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
  AI_EXPENSE_DRAFT_STATUSES,
  classifyAiExpenseDraft,
  resolveReceiptShopNameFromDraft,
} from "./model";

describe("AI expense draft model", () => {
  it("下書き状態はキューから登録済みまでの固定状態に限定する", () => {
    expect(AI_EXPENSE_DRAFT_STATUSES).toEqual([
      "queued",
      "analyzing",
      "ready",
      "needs_review",
      "failed",
      "registered",
    ]);
  });

  it("reviewReasons は UI と分類ロジックで扱える固定理由に限定する", () => {
    expect(AI_EXPENSE_DRAFT_REVIEW_REASONS).toEqual([
      "low_confidence",
      "missing_required_field",
      "ambiguous_document_type",
      "ambiguous_category",
      "multiple_categories",
      "user_confirmation_required",
      "amount_mismatch",
      "parse_failed",
    ]);
  });

  it("レシート下書きは shopName を receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "receipt",
        shopName: "スーパー青葉",
        paymentPlace: "支払場所",
        payeeName: "支払先",
        paymentPurpose: "支払内容",
      }),
    ).toBe("スーパー青葉");
  });

  it("コンビニ払込票下書きは支払先と支払内容を優先して receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "convenience_payment",
        shopName: "セブンイレブン",
        paymentPlace: "セブンイレブン",
        payeeName: "東京都",
        paymentPurpose: "自動車税",
      }),
    ).toBe("東京都 自動車税");
  });

  it("コンビニ払込票で支払先がない場合は支払場所を receipts.shopName に変換する", () => {
    expect(
      resolveReceiptShopNameFromDraft({
        documentType: "convenience_payment",
        paymentPlace: "ローソン",
      }),
    ).toBe("ローソン");
  });

  it("分類しきい値をテスト可能な定数として公開する", () => {
    expect(AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

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
