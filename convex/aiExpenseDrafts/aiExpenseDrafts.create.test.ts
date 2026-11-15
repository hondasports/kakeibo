import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { createFailedDraftFromImageAnalysisHandler, createFromExtractionHandler } from "./internal";
import { GROUP_ID, createIdentity, createMutationCtx, ownedDraft } from "./testHelpers";

describe("aiExpenseDrafts (create)", () => {
  it("画像解析成功時に抽出結果を receipt ではなく AI 支出下書きとして保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "needs_review",
      },
    });

    const result = await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1200,
      rawObservationLines: [
        {
          rawText: "合計 1,200円",
          amountText: "1,200円",
          amountYen: 1200,
          lineRoleCandidates: ["total"],
          roleConfidence: 0.95,
          explicitlyPrinted: true,
          sourceLineIndex: 4,
        },
      ],
      receiptLineClassifications: [
        {
          sourceLineIndex: 4,
          status: "classified",
          candidates: [
            {
              role: "totalCandidate",
              score: 0.98,
              evidence: ["explicit_label:total", "position:receipt_footer"],
            },
          ],
        },
      ],
      confidence: {
        shopName: 0.92,
        date: 0.88,
        amountYen: 0.95,
      },
      warnings: ["日付の印字が薄い"],
      reviewReasons: ["low_confidence"],
    });

    expect(result).toMatchObject({
      _id: "new-draft-id",
      groupId: GROUP_ID,
      status: "needs_review",
      warnings: ["日付の印字が薄い"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        groupId: GROUP_ID,
        sourceType: "image_upload",
        status: "needs_review",
        documentType: "receipt",
        shopName: "スーパー青葉",
        receiptDataContractVersion: 1,
        rawObservation: expect.objectContaining({
          source: "ai_ocr",
          lines: [expect.objectContaining({ rawText: "合計 1,200円", amountYen: 1200 })],
        }),
        receiptInterpretation: expect.objectContaining({
          source: "ai",
          values: expect.objectContaining({
            amountYen: 1200,
            shopName: "スーパー青葉",
            receiptLineClassifications: [
              expect.objectContaining({
                sourceLineIndex: 4,
                candidates: [expect.objectContaining({ role: "totalCandidate" })],
              }),
            ],
          }),
        }),
      }),
    );
    expect(dbInsert).not.toHaveBeenCalledWith("receipts", expect.anything());
    const insertedDraft = dbInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(insertedDraft).not.toHaveProperty("imageDataUrl");
    expect(insertedDraft).not.toHaveProperty("image");
  });

  it("keywordless負額販促行のlineTypeとwarningを下書き明細へ保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });

    await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "マルアイ",
      date: "2026-08-16",
      amountYen: 7462,
      confidence: { shopName: 1, date: 1, amountYen: 1 },
      warnings: [],
      reviewReasons: ["user_confirmation_required"],
      items: [
        {
          itemName: "M002 玉ねぎ3玉",
          lineType: "unknown",
          amountYen: -16,
          printedAmountYen: -16,
          confidence: { itemName: 0.8, amountYen: 1 },
          warnings: ["negative_amount_line_type_uncertain"],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "M002 玉ねぎ3玉",
        lineType: "unknown",
        amountYen: -16,
        printedAmountYen: -16,
        warnings: ["negative_amount_line_type_uncertain"],
      }),
    );
  });

  it("再解析では新しいAI interpretationを保存しつつuser overrideを正本にする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": { groupId: GROUP_ID },
      },
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });
    const preservedUserOverride = {
      source: "user" as const,
      updatedAt: 123,
      fields: ["shopName", "amountYen"],
      values: {
        status: "needs_review" as const,
        documentType: "receipt" as const,
        shopName: "ユーザー確定店舗",
        date: "2026-07-03",
        amountYen: 7803,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "category-food" as any,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["amount_mismatch" as const],
        items: [],
      },
    };

    await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "AI再解析店舗",
      date: "2026-07-04",
      amountYen: 803,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: [],
      preservedUserOverride,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        shopName: "ユーザー確定店舗",
        amountYen: 7803,
        receiptUserOverride: preservedUserOverride,
        receiptInterpretation: expect.objectContaining({
          source: "ai",
          values: expect.objectContaining({ shopName: "AI再解析店舗", amountYen: 803 }),
        }),
      }),
    );
  });

  it("税率別集計と正規化済み明細を下書きへ保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: { ...ownedDraft, _id: "new-draft-id", status: "needs_review" },
    });

    await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "TRIAL",
      date: "2026-07-03",
      amountYen: 1683,
      receiptTotalResolution: {
        status: "verified",
        protectedAmountYen: 1683,
        candidates: [
          {
            amountYen: 1683,
            source: "explicit_label",
            evidence: "extraction.amountYen",
          },
        ],
        reasons: [],
      },
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 1559,
          taxableAmountBasis: "tax_excluded",
          taxYen: 124,
          taxIncludedAmountYen: 1683,
          roundingMethod: "floor",
          confidence: {},
          warnings: [],
        },
      ],
      confidence: { shopName: 1, date: 1, amountYen: 1 },
      warnings: [],
      items: [
        {
          itemName: "たまご",
          amountYen: 322,
          printedAmountYen: 298,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          taxMarker: "*",
          allocatedTaxYen: 24,
          normalizedAmountYen: 322,
          quantity: 1,
          unitPriceYen: 298,
          confidence: {},
          warnings: [],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        amountYen: 1683,
        taxSummaries: expect.any(Array),
        receiptTotalResolution: expect.objectContaining({
          status: "verified",
          protectedAmountYen: 1683,
          candidates: expect.arrayContaining([
            expect.objectContaining({ source: "explicit_label", evidence: "extraction.amountYen" }),
          ]),
        }),
      }),
    );
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({
        amountYen: 322,
        printedAmountYen: 298,
        allocatedTaxYen: 24,
        normalizedAmountYen: 322,
      }),
    );
  });

  it("下書き保存時は抽出精度にかかわらずユーザー確認を必須にする", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": {
          groupId: GROUP_ID,
        },
      },
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "needs_review",
        reviewReasons: ["user_confirmation_required"],
      },
    });

    await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1200,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: {
        documentType: 0.92,
        shopName: 0.91,
        date: 0.93,
        amountYen: 0.96,
        categoryId: 0.9,
      },
      warnings: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        status: "needs_review",
        reviewReasons: ["user_confirmation_required"],
      }),
    );
  });

  it("下書き保存時に明細項目のカテゴリ名・カテゴリID・警告を保存する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "category-food": {
          groupId: GROUP_ID,
        },
        "category-medical": {
          groupId: GROUP_ID,
        },
      },
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "ready",
        reviewReasons: [],
      },
      insertedIds: ["new-draft-id", "item-food", "item-medical"],
    });

    await createFromExtractionHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1130,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoryId: "category-food" as any,
      confidence: {
        documentType: 0.92,
        shopName: 0.91,
        date: 0.93,
        amountYen: 0.96,
        categoryId: 0.9,
      },
      warnings: [],
      items: [
        {
          itemName: "パン",
          amountYen: 150,
          categoryName: "食費",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "category-food" as any,
          confidence: {
            itemName: 0.9,
            amountYen: 0.95,
            categoryName: 0.8,
            categoryId: 0.8,
          },
          warnings: [],
        },
        {
          itemName: "胃薬",
          amountYen: 980,
          categoryName: "医療費",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          categoryId: "category-medical" as any,
          confidence: {
            itemName: 0.85,
            amountYen: 0.95,
            categoryName: 0.82,
            categoryId: 0.82,
          },
          warnings: ["品名が不鮮明です"],
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenNthCalledWith(
      2,
      "aiExpenseDraftItems",
      expect.objectContaining({
        groupId: GROUP_ID,
        draftId: "new-draft-id",
        itemName: "パン",
        amountYen: 150,
        categoryName: "食費",
        categoryId: "category-food",
        confidence: expect.objectContaining({
          categoryName: 0.8,
          categoryId: 0.8,
        }),
        warnings: [],
      }),
    );
    expect(dbInsert).toHaveBeenNthCalledWith(
      3,
      "aiExpenseDraftItems",
      expect.objectContaining({
        itemName: "胃薬",
        amountYen: 980,
        categoryName: "医療費",
        categoryId: "category-medical",
        warnings: ["品名が不鮮明です"],
      }),
    );
  });

  it("画像解析失敗時に failed 状態の下書きを作成する", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "failed",
        documentType: "unknown",
        warnings: ["画像解析に失敗しました"],
        reviewReasons: ["parse_failed"],
      },
    });

    await createFailedDraftFromImageAnalysisHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      warning: "画像解析に失敗しました",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "aiExpenseDrafts",
      expect.objectContaining({
        groupId: GROUP_ID,
        status: "failed",
        documentType: "unknown",
        warnings: ["画像解析に失敗しました"],
        reviewReasons: ["parse_failed"],
      }),
    );
  });

  it("存在しないカテゴリを指定した下書き作成は拒否する", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFromExtractionHandler(ctx, {
        groupId: GROUP_ID as Id<"groups">,
        documentType: "receipt",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: "category-missing" as any,
        confidence: {},
        warnings: [],
      }),
    ).rejects.toMatchObject({ data: "Category does not belong to the current group" });
  });

  it("作成直後に下書きを取得できない場合は失敗として扱う", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFromExtractionHandler(ctx, {
        groupId: GROUP_ID as Id<"groups">,
        documentType: "receipt",
        confidence: {},
        warnings: [],
      }),
    ).rejects.toMatchObject({ data: "AI expense draft was not found after creation" });
  });

  it("失敗下書きの作成直後に下書きを取得できない場合は失敗として扱う", async () => {
    const ctx = createMutationCtx(createIdentity());

    await expect(
      createFailedDraftFromImageAnalysisHandler(ctx, {
        groupId: GROUP_ID as Id<"groups">,
        warning: "解析に失敗しました",
      }),
    ).rejects.toMatchObject({ data: "AI expense draft was not found after creation" });
  });

  it("未認証ユーザーは下書きを作成できない", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      createFromExtractionHandler(ctx, {
        groupId: GROUP_ID as Id<"groups">,
        documentType: "receipt",
        confidence: {},
        warnings: [],
        reviewReasons: ["missing_required_field"],
      }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});
