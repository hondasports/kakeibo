import { describe, expect, it } from "vitest";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";
import { applyReceiptTaxSettingsHandler } from "./applyReceiptTaxSettings";
import { resetReceiptToAiInterpretationHandler } from "./receiptDataContract";
import {
  GROUP_ID,
  DRAFT_ID,
  CAT_ID,
  createInMemoryMutationCtx,
  externalTaxSummaries,
} from "./testHelpers";

describe("updateForReviewHandler tax reinterpretation (user overrides)", () => {
  it("明細金額の手修正は税再解釈後も printedAmountYen に保持される", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          taxResolutionStatus: "unresolved",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 99,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    const items = getItems();
    expect(items[0]?.printedAmountYen).toBe(99);
    expect(items[0]?.taxResolutionStatus).toBe("unresolved");
  });

  it("ユーザーが7,803円へ修正した合計を743円+60円の税算術で上書きしない", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 803,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 0.5, categoryId: 1 },
        warnings: [],
        reviewReasons: ["amount_mismatch"],
        receiptTotalResolution: {
          status: "ambiguous",
          protectedAmountYen: 803,
          candidates: [
            {
              amountYen: 803,
              source: "explicit_label",
              evidence: "extraction.amountYen",
            },
            {
              amountYen: 7803,
              source: "payment_change",
              evidence: "cash_received:10000 - change:2197",
            },
          ],
          reasons: ["multiple_receipt_total_candidates"],
        },
        taxSummaries: [
          {
            ...externalTaxSummaries[0],
            taxableAmountYen: 743,
            taxYen: 60,
            taxIncludedAmountYen: 803,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 743,
          printedAmountYen: 743,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 743,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.amountYen).toBe(7803);
    expect(result.status).toBe("needs_review");
    expect(getDraft().amountYen).toBe(7803);
    expect(getDraft().confidence.amountYen).toBe(1);
    expect(getDraft().receiptUserOverride).toMatchObject({
      source: "user",
      fields: expect.arrayContaining(["amountYen", "items"]),
      values: expect.objectContaining({
        amountYen: 7803,
        items: [expect.objectContaining({ itemName: "商品A", amountYen: 743 })],
      }),
    });
    expect(getDraft().receiptTotalResolution).toMatchObject({
      status: "verified",
      protectedAmountYen: 7803,
      candidates: expect.arrayContaining([
        expect.objectContaining({ amountYen: 7803, source: "user_confirmed" }),
        expect.objectContaining({
          amountYen: 7803,
          source: "payment_change",
          evidence: "cash_received:10000 - change:2197",
        }),
        expect.objectContaining({ amountYen: 803, source: "tax_arithmetic" }),
      ]),
    });
    expect(getItems()[0]).toMatchObject({
      printedAmountYen: 743,
      normalizedAmountYen: 743,
      allocatedTaxYen: 0,
      taxResolutionStatus: "unresolved",
    });
  });

  it("税率別集計なしでも補正額をuser_confirmed totalとして保存する", async () => {
    const { ctx, getDraft } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 803,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        receiptTotalResolution: {
          status: "verified",
          protectedAmountYen: 803,
          candidates: [
            { amountYen: 803, source: "explicit_label", evidence: "extraction.amountYen" },
          ],
          reasons: [],
        },
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
    });

    expect(getDraft()).toMatchObject({
      amountYen: 7803,
      receiptTotalResolution: {
        status: "verified",
        protectedAmountYen: 7803,
        candidates: expect.arrayContaining([
          expect.objectContaining({ amountYen: 7803, source: "user_confirmed" }),
        ]),
      },
      receiptUserOverride: {
        fields: expect.arrayContaining(["amountYen", "receiptTotalResolution"]),
        values: expect.objectContaining({
          amountYen: 7803,
          receiptTotalResolution: expect.objectContaining({ protectedAmountYen: 7803 }),
        }),
      },
    });
  });

  it("明示操作でuser overrideを解除しAI interpretationへ戻せる", async () => {
    const aiValues = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "AI店舗",
      date: "2026-07-04",
      amountYen: 803,
      categoryId: CAT_ID,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: ["ai_warning"],
      reviewReasons: ["user_confirmation_required" as const],
      items: [
        {
          itemName: "AI商品",
          amountYen: 803,
          printedAmountYen: 803,
          categoryId: CAT_ID,
          confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
        },
      ],
    };
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        ...aiValues,
        sourceType: "image_upload",
        receiptInterpretation: { source: "ai", interpretedAt: 1, values: aiValues },
        rawObservation: {
          source: "ai_ocr",
          observedAt: 1,
          lines: [
            {
              rawText: "合計 803円",
              amountText: "803円",
              amountYen: 803,
              lineRoleCandidates: ["total"],
              roleConfidence: 0.9,
              explicitlyPrinted: true,
              sourceLineIndex: 1,
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-ai",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          ...aiValues.items[0],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "ユーザー店舗",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "ユーザー商品",
          amountYen: 7803,
          categoryId: CAT_ID,
        },
      ],
    });
    expect(getDraft().receiptUserOverride).toBeDefined();

    await resetReceiptToAiInterpretationHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    expect(getDraft()).toMatchObject({
      shopName: "AI店舗",
      amountYen: 803,
      receiptUserOverride: undefined,
      rawObservation: expect.objectContaining({ source: "ai_ocr" }),
    });
    expect(getItems()).toEqual([
      expect.objectContaining({ itemName: "AI商品", amountYen: 803, printedAmountYen: 803 }),
    ]);
  });

  it("101件以上の明細を持つ下書きのリセットは全件削除してからスナップショットを復元する", async () => {
    const aiValues = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "AI店舗",
      date: "2026-07-04",
      amountYen: 803,
      categoryId: CAT_ID,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: [] as string[],
      reviewReasons: ["user_confirmation_required" as const],
      items: [
        {
          itemName: "AI商品",
          amountYen: 803,
          printedAmountYen: 803,
          categoryId: CAT_ID,
          confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
        },
      ],
    };
    const staleItems = Array.from({ length: 101 }, (_, index) => ({
      _id: `stale-item-${index}`,
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      itemName: `旧明細${index}`,
      amountYen: 1,
      categoryId: CAT_ID,
      confidence: {},
      createdAt: index,
      updatedAt: index,
    }));
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        ...aiValues,
        sourceType: "image_upload",
        receiptInterpretation: { source: "ai", interpretedAt: 1, values: aiValues },
        createdAt: 1,
        updatedAt: 1,
      },
      items: staleItems,
    });

    await resetReceiptToAiInterpretationHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    const items = getItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemName: "AI商品", amountYen: 803 });
    expect(items.every((item) => !item.itemName.startsWith("旧明細"))).toBe(true);
  });

  it("外税一括適用後に印字金額を変えず保存すると ready になり得る", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await applyReceiptTaxSettingsHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);
    const afterBulk = getItems()[0];
    expect(afterBulk?.taxResolutionStatus).toBe("resolved");
    expect(afterBulk?.printedAmountYen).toBe(100);

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: Number(afterBulk!.printedAmountYen),
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("ready");
    expect(getItems()[0]?.printedAmountYen).toBe(100);
    expect(getDraft().reviewReasons).not.toContain("amount_mismatch");
  });
});
