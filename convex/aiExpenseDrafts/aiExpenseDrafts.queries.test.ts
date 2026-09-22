import { analyzeReceiptImageToDraftHandler } from "./actions";
import { deleteDraftHandler } from "./mutations";
import { getWithItemsHandler, listByStatusHandler } from "./queries";
import {
  GROUP_ID,
  OTHER_GROUP_ID,
  createActionCtx,
  createIdentity,
  createMutationCtx,
  createQueryCtx,
  mixedCategoryDraftItems,
  ownedDraft,
  readyDraft,
  withEnv,
} from "./testHelpers";
import { describe, expect, it, vi } from "vitest";

describe("aiExpenseDrafts (queries)", () => {
  it("未登録下書きは明細ごとキューから削除できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
      },
      items: [
        {
          _id: "item-1",
          _creationTime: 1,
          groupId: GROUP_ID,
          draftId: "draft-owned",
          itemName: "牛乳",
          amountYen: 198,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await deleteDraftHandler(ctx, { draftId: "draft-owned" as any });

    expect(result).toEqual({ deleted: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("item-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("draft-owned");
  });

  it("登録済み下書きはキューから削除できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...ownedDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-1",
        },
      },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteDraftHandler(ctx, { draftId: "draft-registered" as any }),
    ).rejects.toMatchObject({
      data: "Registered AI expense draft cannot be deleted from the queue",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("listByStatus は認証ユーザー本人の下書きだけ返す", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [
        ownedDraft,
        {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      ],
    });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result).toEqual([ownedDraft]);
  });

  it("listByStatus はraw observation・AI interpretation・user overrideを破壊せず返す", async () => {
    const contractDraft = {
      ...ownedDraft,
      rawObservation: {
        source: "ai_ocr",
        observedAt: 1,
        lines: [
          {
            rawText: "合計 1,200円",
            amountText: "1,200円",
            amountYen: 1200,
            lineRoleCandidates: ["total"],
            roleConfidence: 0.9,
            explicitlyPrinted: true,
            sourceLineIndex: 5,
          },
        ],
      },
      receiptInterpretation: { source: "ai", interpretedAt: 1, values: { amountYen: 1200 } },
      receiptUserOverride: { source: "user", updatedAt: 2, fields: ["amountYen"] },
    };
    const ctx = createQueryCtx(createIdentity(), { drafts: [contractDraft] });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result[0]).toMatchObject({
      rawObservation: contractDraft.rawObservation,
      receiptInterpretation: contractDraft.receiptInterpretation,
      receiptUserOverride: contractDraft.receiptUserOverride,
    });
  });

  it("listByStatus は明細のカテゴリ別集約サマリーを返す", async () => {
    const draft = {
      ...readyDraft,
      amountYen: 1500,
    };
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [draft],
      items: [
        ...mixedCategoryDraftItems,
        {
          _id: "draft-item-uncategorized",
          _creationTime: 0,
          groupId: GROUP_ID,
          draftId: "draft-ready",
          itemName: "未分類品",
          amountYen: 120,
          confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.7 },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    const result = await listByStatusHandler(ctx, { status: "ready" });

    expect(result).toEqual([
      expect.objectContaining({
        _id: "draft-ready",
        itemSummary: {
          itemTotalYen: 1500,
          itemDifferenceYen: 0,
          hasUncategorizedItems: true,
          hasLowConfidenceItems: true,
          categoryAggregates: [
            { categoryId: "cat-food", amountYen: 400 },
            { categoryId: "cat-medical", amountYen: 980 },
          ],
        },
      }),
    ]);
  });

  it("getWithItems は他ユーザーの下書きを参照できない", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      },
    });

    await expect(
      getWithItemsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-other" as any,
      }),
    ).rejects.toMatchObject({ data: "AI expense draft does not belong to the current group" });
  });

  // ---------------------------------------------------------------------------
  // Issue #173: カテゴリ候補生成ロジック連携
  // ---------------------------------------------------------------------------

  it("カテゴリ名がカテゴリリストに存在しない場合は categoryId を undefined で渡す", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      // mock の categoryName は "食費" だが、カテゴリリストには "日用品" だけ
      const runQuery = vi
        .fn()
        .mockResolvedValueOnce({
          hasAcceptedExternalApiConsent: true,
          acceptedAt: 1234567890,
        })
        .mockResolvedValueOnce([
          { _id: "cat-daily", name: "日用品", color: "#A6B28B", isActive: true, sortOrder: 2 },
        ]);
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-no-category",
        status: "needs_review",
      });

      const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs] = runMutation.mock.calls[0];
      // 一致するカテゴリがなければ categoryId は含まれない（または undefined）
      expect(callArgs.categoryId).toBeUndefined();
    });
  });

  it("カテゴリ候補生成・解決フローで正しく categoryId が解決される", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
      // mock の categoryName は "食費"。buildCategoryCandidates → resolveCategoryIdFromCandidates で categoryId が解決される
      const runQuery = vi
        .fn()
        .mockResolvedValueOnce({
          hasAcceptedExternalApiConsent: true,
          acceptedAt: 1234567890,
        })
        .mockResolvedValueOnce([
          { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
          { _id: "cat-tax", name: "税金", color: "#AAB7C4", isActive: true, sortOrder: 9 },
        ]);
      const runMutation = vi.fn().mockResolvedValue({
        _id: "draft-payment",
        status: "needs_review",
      });

      const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });

      await analyzeReceiptImageToDraftHandler(ctx, {
        imageDataUrl: "data:image/jpeg;base64,AAA",
      });

      // mock モードでは documentType: "receipt", categoryName: "食費" が返るため
      // buildCategoryCandidates で "食費" が候補に入り categoryId が解決される
      expect(runMutation).toHaveBeenCalledTimes(1);
      const [, callArgs] = runMutation.mock.calls[0];
      expect(callArgs.categoryId).toBe("cat-food");
    });
  });

  it("画像解析の明細ごとに categoryId を解決して下書き明細へ渡す", async () => {
    const runQuery = vi
      .fn()
      .mockResolvedValueOnce({
        hasAcceptedExternalApiConsent: true,
        acceptedAt: 1234567890,
      })
      .mockResolvedValueOnce([
        { _id: "cat-food", name: "食費", color: "#F4A27A", isActive: true, sortOrder: 1 },
        { _id: "cat-medical", name: "医療費", color: "#C8D9A2", isActive: true, sortOrder: 2 },
      ]);
    const runMutation = vi.fn().mockResolvedValue({
      _id: "draft-line-items",
      status: "needs_review",
    });
    const ctx = createActionCtx(createIdentity(), true, { runQuery, runMutation });
    const extractionSpy = vi.spyOn(globalThis, "fetch");
    extractionSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    documentType: "receipt",
                    shopName: "ドラッグストアA",
                    paymentPlace: "",
                    payeeName: "",
                    paymentPurpose: "",
                    date: "2026-06-21",
                    amountYen: 1130,
                    categoryName: "食費",
                    items: [
                      {
                        itemName: "パン",
                        printedAmountYen: 150,
                        amountBasis: "tax_included",
                        taxRatePercent: 10,
                        taxMarker: "",
                        quantity: 1,
                        unitPriceYen: 150,
                        categoryName: "食費",
                        confidence: {
                          itemName: 0.9,
                          printedAmountYen: 0.95,
                          amountBasis: 0.9,
                          taxRatePercent: 0.9,
                          categoryName: 0.8,
                        },
                        warnings: [],
                      },
                      {
                        itemName: "胃薬",
                        printedAmountYen: 980,
                        amountBasis: "tax_included",
                        taxRatePercent: 10,
                        taxMarker: "",
                        quantity: 1,
                        unitPriceYen: 980,
                        categoryName: "医療費",
                        confidence: {
                          itemName: 0.85,
                          printedAmountYen: 0.95,
                          amountBasis: 0.9,
                          taxRatePercent: 0.9,
                          categoryName: 0.82,
                        },
                        warnings: ["品名が不鮮明です"],
                      },
                    ],
                    taxSummaries: [],
                    confidence: {
                      documentType: 0.92,
                      shopName: 0.85,
                      paymentPlace: 0.1,
                      payeeName: 0.1,
                      paymentPurpose: 0.1,
                      date: 0.9,
                      amountYen: 0.98,
                      categoryName: 0.7,
                    },
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    try {
      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          await analyzeReceiptImageToDraftHandler(ctx, {
            imageDataUrl: "data:image/jpeg;base64,AAA",
          });
          const requestBody = JSON.parse(String(extractionSpy.mock.calls[0]?.[1]?.body)) as {
            text: {
              format: {
                schema: {
                  properties: {
                    items: { items: { properties: { categoryName: { enum: string[] } } } };
                  };
                };
              };
            };
          };
          expect(
            requestBody.text.format.schema.properties.items.items.properties.categoryName.enum,
          ).toEqual(["", "食費", "医療費"]);
        },
      );
    } finally {
      extractionSpy.mockRestore();
    }

    expect(runMutation).toHaveBeenCalledTimes(1);
    const [, callArgs] = runMutation.mock.calls[0];
    expect(callArgs.items).toEqual([
      expect.objectContaining({
        itemName: "パン",
        amountYen: 150,
        categoryName: "食費",
        categoryId: "cat-food",
        confidence: expect.objectContaining({
          itemName: 0.9,
          amountYen: 0.95,
          categoryName: 0.8,
          categoryId: 0.8,
        }),
        warnings: [],
      }),
      expect.objectContaining({
        itemName: "胃薬",
        amountYen: 980,
        categoryName: "医療費",
        categoryId: "cat-medical",
        warnings: ["品名が不鮮明です"],
      }),
    ]);
  });
});
