import { describe, expect, it } from "vitest";
import {
  mapConvexDraftToAiExpenseDraft,
  mapDraftItemsToReviewItems,
  mapDraftToQueueItem,
} from "./mappers";

describe("mapConvexDraftToAiExpenseDraft", () => {
  it("新契約の4層とversionをUI callerへ欠落なく渡す", () => {
    const rawObservation = { source: "ai_ocr", observedAt: 1, lines: [] } as const;
    const receiptInterpretation = { source: "ai", interpretedAt: 1, values: {} } as const;
    const receiptUserOverride = {
      source: "user",
      updatedAt: 2,
      fields: ["amountYen"],
      values: {},
    } as const;
    const derivedRegistration = {
      source: "derived",
      registeredAt: 3,
      destination: "receipts",
      values: { amountYen: 803, date: "2026-08-25", categoryIds: [] },
    } as const;
    const receiptTaxDecision = {
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "explicitLabel",
      evidence: ["explicit_label:included", "explicit_label:rate_10"],
      reasons: [],
      candidates: [],
      taxAmount: { printedTaxYen: 100, roundingMethod: "round", source: "printed" },
    } as const;

    const mapped = mapConvexDraftToAiExpenseDraft({
      _id: "draft-1",
      _creationTime: 1,
      groupId: "group-1",
      createdByUserId: "user-1",
      sourceType: "image_upload",
      status: "ready",
      documentType: "receipt",
      confidence: { documentType: 1 },
      reviewReasons: [],
      receiptDataContractVersion: 1,
      rawObservation,
      receiptInterpretation,
      receiptUserOverride,
      receiptTaxDecision,
      derivedRegistration,
      createdAt: 1,
      updatedAt: 1,
    } as never);

    expect(mapped).toMatchObject({
      receiptDataContractVersion: 1,
      rawObservation,
      receiptInterpretation,
      receiptUserOverride,
      receiptTaxDecision,
      derivedRegistration,
    });
  });
});

describe("mapDraftToQueueItem", () => {
  it("失敗warningをキューへ渡して原因別hintを生成する", () => {
    const item = mapDraftToQueueItem(
      {
        _id: "draft-timeout",
        status: "failed",
        documentType: "receipt",
        reviewReasons: [],
        warnings: ["[receipt_extraction:timeout] response body timeout"],
      },
      {},
    );

    expect(item.warnings).toEqual(["[receipt_extraction:timeout] response body timeout"]);
    expect(item.failureHint).toContain("タイムアウト");
  });

  it("統合済みの払込票は店名・内容を一覧タイトルに使う", () => {
    const item = mapDraftToQueueItem(
      {
        _id: "draft-payment",
        status: "ready",
        documentType: "convenience_payment",
        shopName: "大阪市水道局 水道料金",
        reviewReasons: [],
      },
      {},
    );

    expect(item.title).toBe("大阪市水道局 水道料金");
  });

  it("明細サマリーのカテゴリ名・差額・確認フラグをキュー表示用に写す", () => {
    const item = mapDraftToQueueItem(
      {
        _id: "draft-mixed-receipt",
        status: "ready",
        documentType: "receipt",
        shopName: "ドラッグストアA",
        amountYen: 1500,
        categoryId: "cat-daily",
        reviewReasons: [],
        itemSummary: {
          itemTotalYen: 1380,
          itemDifferenceYen: 120,
          hasUncategorizedItems: true,
          hasLowConfidenceItems: true,
          categoryAggregates: [
            { categoryId: "cat-food", amountYen: 400 },
            { categoryId: "cat-medical", amountYen: 980 },
          ],
        },
      },
      {},
      [
        { _id: "cat-daily", name: "日用品" },
        { _id: "cat-food", name: "食費" },
        { _id: "cat-medical", name: "医療費" },
      ],
    );

    expect(item).toMatchObject({
      id: "draft-mixed-receipt",
      title: "ドラッグストアA",
      categoryName: "日用品",
      itemTotalYen: 1380,
      itemDifferenceYen: 120,
      hasUncategorizedItems: true,
      hasLowConfidenceItems: true,
      categoryAggregates: [
        { categoryId: "cat-food", categoryName: "食費", amountYen: 400 },
        { categoryId: "cat-medical", categoryName: "医療費", amountYen: 980 },
      ],
    });
  });
});

describe("mapDraftItemsToReviewItems", () => {
  it("外税確定の明細は印字金額を編集用金額にする", () => {
    const [item] = mapDraftItemsToReviewItems([
      {
        _id: "item-1",
        itemName: "たまご",
        amountYen: 322,
        printedAmountYen: 298,
        amountBasis: "tax_excluded",
        taxRatePercent: 8,
        allocatedTaxYen: 24,
        normalizedAmountYen: 322,
        taxResolutionStatus: "resolved",
        categoryId: "cat-food",
      },
    ]);

    expect(item).toMatchObject({
      amountYen: "298",
      printedAmountYen: 298,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      allocatedTaxYen: 24,
      normalizedAmountYen: 322,
    });
  });

  it("内税確定の明細は登録用金額を編集用金額にする", () => {
    const [item] = mapDraftItemsToReviewItems([
      {
        _id: "item-1",
        itemName: "パン",
        amountYen: 108,
        printedAmountYen: 108,
        amountBasis: "tax_included",
        taxRatePercent: 8,
        normalizedAmountYen: 108,
        taxResolutionStatus: "resolved",
        categoryId: "cat-food",
      },
    ]);

    expect(item.amountYen).toBe("108");
  });

  it("税未確定の明細は印字金額を編集用金額にする", () => {
    const [item] = mapDraftItemsToReviewItems([
      {
        _id: "item-1",
        itemName: "E2E税テスト商品",
        amountYen: 108,
        printedAmountYen: 99,
        normalizedAmountYen: 108,
        taxResolutionStatus: "unresolved",
        categoryId: "cat-food",
      },
    ]);

    expect(item.amountYen).toBe("99");
  });
});
