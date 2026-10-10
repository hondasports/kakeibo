import { describe, expect, it } from "vitest";
import {
  isAmountAndTaxResolved,
  isUnrelatedToAmountTaxGuidanceId,
  mapConvexDraftToAiExpenseDraft,
  mapDraftItemsToReviewItems,
  mapDraftToQueueItem,
  mapDraftToReviewForm,
} from "./mappers";
import type { AiExpenseDraft } from "../types/types";
import { mixedTaxReviewFixture } from "./reviewTaxPreviewTestHelpers";
import { RECEIPT_TAX_CHOICE_FIELDS } from "../../../../lib/domain/aiExpenseDrafts/receiptDataContract";

describe("mapDraftToReviewForm: 税設定の補正元を保持する", () => {
  const draft = {
    _id: "draft-basis-890",
    status: "ready",
    documentType: "receipt",
    amountYen: 264,
    receiptTaxDecision: { priceTaxTreatment: "excluded", taxRateComposition: "rate8" },
    receiptUserOverride: { fields: ["items", "receiptTotalResolution", "receiptTaxDecision"] },
  } as AiExpenseDraft;

  it("商品補正から得た判定を新しい全体税設定として再送しない", () => {
    expect(mapDraftToReviewForm(draft)).toMatchObject({
      priceTaxTreatment: undefined,
      taxRateComposition: undefined,
    });
  });

  it("ユーザーが明示した全体税設定は再表示する", () => {
    expect(
      mapDraftToReviewForm({
        ...draft,
        receiptUserOverride: {
          ...draft.receiptUserOverride!,
          fields: [
            ...draft.receiptUserOverride!.fields,
            ...Object.values(RECEIPT_TAX_CHOICE_FIELDS),
          ],
        },
      }),
    ).toMatchObject({ priceTaxTreatment: "excluded", taxRateComposition: "rate8" });
  });

  it.each([
    [RECEIPT_TAX_CHOICE_FIELDS.priceTaxTreatment, "excluded", undefined],
    [RECEIPT_TAX_CHOICE_FIELDS.taxRateComposition, undefined, "rate8"],
  ])("全体設定の片軸だけが明示された場合はその軸だけ復元する (%s)", (field, price, rate) => {
    expect(
      mapDraftToReviewForm({
        ...draft,
        receiptUserOverride: {
          ...draft.receiptUserOverride!,
          fields: [...draft.receiptUserOverride!.fields, "taxSummaries", field!],
        },
      }),
    ).toMatchObject({ priceTaxTreatment: price, taxRateComposition: rate });
  });

  it("内訳補正から得た判定を全体設定へ復元しない", () => {
    expect(
      mapDraftToReviewForm({
        ...draft,
        receiptUserOverride: {
          ...draft.receiptUserOverride!,
          fields: [...draft.receiptUserOverride!.fields, "taxSummaries"],
        },
      }),
    ).toMatchObject({ priceTaxTreatment: undefined, taxRateComposition: undefined });
  });

  it("商品補正の不明を合計だけ保存の明示選択として復元しない", () => {
    expect(
      mapDraftToReviewForm({
        ...draft,
        receiptTaxDecision: {
          ...draft.receiptTaxDecision!,
          priceTaxTreatment: "unknown",
        },
      }),
    ).toMatchObject({ priceTaxTreatment: undefined, taxRateComposition: undefined });
  });

  it("保存された不明の選択は合計だけ保存の再編集でも保持する", () => {
    expect(
      mapDraftToReviewForm({
        ...draft,
        receiptTaxDecision: {
          ...draft.receiptTaxDecision!,
          priceTaxTreatment: "unknown",
          taxRateComposition: "unknown",
        },
        receiptUserOverride: { ...draft.receiptUserOverride!, fields: ["receiptTaxDecision"] },
      }),
    ).toMatchObject({ priceTaxTreatment: "unknown", taxRateComposition: "unknown" });
  });
});

describe("mapDraftToReviewForm: 旧形式の全体税設定", () => {
  it("保存済みtotalOnlyの不明軸を保持し、未指定の既知軸を再送しない", () => {
    const draft = {
      _id: "legacy-tax-choice",
      status: "ready",
      documentType: "receipt",
      amountYen: 264,
      registrationMode: "totalOnly",
      receiptTaxDecision: { priceTaxTreatment: "unknown", taxRateComposition: "rate8" },
      receiptUserOverride: { fields: ["items", "receiptTaxDecision", "taxSummaries"] },
    } as AiExpenseDraft;
    expect(mapDraftToReviewForm(draft)).toMatchObject({
      priceTaxTreatment: "unknown",
      taxRateComposition: undefined,
    });
  });
});

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

describe("mapDraftToQueueItem の金額・税内訳の確認理由", () => {
  function summary892Draft(overrides: Partial<AiExpenseDraft> = {}) {
    const { draft, items } = mixedTaxReviewFixture();
    return {
      ...draft,
      status: "needs_review" as const,
      amountYen: 1782,
      categoryId: "food",
      reviewReasons: ["user_confirmation_required", "amount_mismatch"],
      items: items.map((item) => ({
        _id: item.id,
        itemName: item.itemName,
        amountYen: Number(item.amountYen),
        printedAmountYen: item.printedAmountYen,
        amountBasis: item.amountBasis,
        taxRatePercent: item.taxRatePercent,
        taxResolutionStatus: item.taxResolutionStatus,
        taxResolutionSource: item.taxResolutionSource,
        categoryId: "food",
      })),
      ...overrides,
    } as AiExpenseDraft;
  }

  it("ダイアログで解決済みの金額・税内訳は、一覧に古い理由を残さない（#997）", () => {
    const draft = summary892Draft();
    expect(isAmountAndTaxResolved(draft)).toBe(true);
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toEqual(["user_confirmation_required"]);
  });

  it("税率衝突など真の不一致は一覧に残す", () => {
    const draft = summary892Draft();
    draft.taxSummaries = draft.taxSummaries?.map((summary) =>
      summary.taxRatePercent === 10
        ? { ...summary, taxableAmountBasis: "tax_excluded", status: "contradictory" }
        : summary,
    );
    expect(isAmountAndTaxResolved(draft)).toBe(false);
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toEqual([
      "user_confirmation_required",
      "amount_mismatch",
    ]);
  });

  it("支払合計と明細が合わない場合は理由を残す", () => {
    const draft = summary892Draft({ amountYen: 1800 });
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toContain("amount_mismatch");
  });

  it("明細を持たない下書きは解決済みとみなさず、保存済みの理由を保つ", () => {
    const draft = summary892Draft({ items: undefined });
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toEqual([
      "user_confirmation_required",
      "amount_mismatch",
    ]);
  });

  it("税以外の独立した理由は解決済みでも隠さない", () => {
    const draft = summary892Draft({
      reviewReasons: ["amount_mismatch", "low_confidence", "ambiguous_category"],
    });
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toEqual([
      "low_confidence",
      "ambiguous_category",
    ]);
  });

  it("割引対象を推論してから照合する（ダイアログと同じ初期化）", () => {
    const draft = summary892Draft();
    draft.items = [
      ...(draft.items ?? []),
      {
        _id: "item-extra",
        itemName: "追加商品",
        amountYen: 30,
        printedAmountYen: 30,
        amountBasis: "tax_excluded",
        taxRatePercent: 8,
        taxResolutionStatus: "resolved",
        taxResolutionSource: "item_explicit",
        categoryId: "food",
      },
      {
        _id: "item-discount",
        itemName: "割引",
        lineType: "discount",
        amountYen: -30,
        printedAmountYen: -30,
        amountBasis: "tax_excluded",
        taxRatePercent: 8,
        taxResolutionStatus: "resolved",
        taxResolutionSource: "item_explicit",
        categoryId: "food",
      },
    ];
    expect(isAmountAndTaxResolved(draft)).toBe(true);
  });

  it("税以外の明細不備（金額0円）が残る間は金額の理由を外さない", () => {
    const draft = summary892Draft();
    draft.items = [
      ...(draft.items ?? []),
      { _id: "item-zero", itemName: "無料品", amountYen: 0, categoryId: "food" },
    ];
    expect(mapDraftToQueueItem(draft, {}).reviewReasons).toContain("amount_mismatch");
  });
});

describe("isUnrelatedToAmountTaxGuidanceId", () => {
  it("金額・税内訳に関係しない案内だけを除外対象にする", () => {
    for (const id of ["document", "shopName", "date", "category", "category-1", "reading"]) {
      expect(isUnrelatedToAmountTaxGuidanceId(id)).toBe(true);
    }
    for (const id of ["summary-0", "allocation", "amount-1", "aggregate", "name-1", "tax-1"]) {
      expect(isUnrelatedToAmountTaxGuidanceId(id)).toBe(false);
    }
  });
});
