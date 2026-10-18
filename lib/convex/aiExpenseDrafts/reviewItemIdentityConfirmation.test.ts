import { observationLine } from "../../domain/receipt/tax/fixtures/unprovenTargetReceipt";
import { expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { GROUP_ID, DRAFT_ID, CAT_ID, createInMemoryMutationCtx } from "./testHelpers";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";
import { updateDraftItemTaxOverridesHandler } from "./updateItemTaxOverrides";
import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import { buildReviewTaxPreview } from "../../domain/aiExpenseDrafts/reviewItemsTaxPreview";
import { mapDraftItemsToReviewItems } from "../../domain/aiExpenseDrafts/reviewDraftMapping";

function fixture(raw: boolean) {
  const state = createInMemoryMutationCtx({
    draft: {
      _id: DRAFT_ID,
      groupId: GROUP_ID,
      status: "ready",
      sourceType: "image_upload",
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 540,
      categoryId: CAT_ID,
      confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      warnings: [],
      reviewReasons: [],
      taxSummaries: [],
      createdAt: 0,
      updatedAt: 0,
      ...(raw
        ? {
            rawObservation: {
              source: "ai_ocr",
              observedAt: 0,
              lines: [
                observationLine("合計540円", 540, 0),
                observationLine("8% 内消費税40円", 40, 1),
              ],
            },
          }
        : {}),
    },
    items: [
      {
        _id: "old-item",
        groupId: GROUP_ID,
        draftId: DRAFT_ID,
        itemName: "日用品",
        lineType: "item",
        amountYen: 540,
        printedAmountYen: 540,
        amountBasis: "tax_included",
        taxRatePercent: 10,
        taxResolutionStatus: "resolved",
        taxResolutionSource: "item_explicit",
        taxConfirmedFields: ["amountBasis", "taxRatePercent"],
        categoryId: CAT_ID,
        confidence: {},
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  });
  const save = (
    name: string,
    confirmedTaxRatePercent?: 0 | 8 | 10 | null,
    lineType: "item" | "unknown" = "item",
  ) =>
    updateForReviewHandler(state.ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 540,
      categoryId: CAT_ID,
      priceTaxTreatment: "included",
      taxRateComposition: confirmedTaxRatePercent === 8 ? "rate8" : undefined,
      items: state.getItems().map((item) => ({
        itemId: item._id as Id<"aiExpenseDraftItems">,
        itemName: name,
        lineType,
        amountYen: 540,
        categoryId: CAT_ID,
        confirmedTaxRatePercent,
      })),
    });
  const register = () =>
    buildDraftRegistrationItems(
      state.getDraft() as unknown as Doc<"aiExpenseDrafts">,
      state.getItems() as unknown as Doc<"aiExpenseDraftItems">[],
    );
  return { ...state, save, register };
}

it.each([false, true])(
  "原文あり=%s: 名前変更→保存→再表示では旧税率を確認済みにせず、選び直したら登録できる",
  async (raw) => {
    const { ctx, getItems, getDraft, save, register } = fixture(raw);
    await save("パン");
    expect(getDraft().status).toBe("needs_review");
    expect(getItems()[0]).toMatchObject({
      taxConfirmedFields: ["amountBasis"],
      taxAllocationStatus: "unallocated",
    });
    expect(getItems()[0].taxReviewReasons).toContain("item_identity_changed");
    expect(register).toThrow(/未確定/);
    const preview = buildReviewTaxPreview(
      mapDraftItemsToReviewItems(getItems() as unknown as Doc<"aiExpenseDraftItems">[]),
      {
        paidTotalYen: 540,
        taxSummaries: getDraft().taxSummaries as never,
        rawObservation: getDraft().rawObservation as never,
        priceTaxTreatment: "included",
        taxRateComposition: "rate10",
      },
    );
    expect(preview.items[0].taxAllocationStatus).toBe("unallocated");
    await save("パン");
    expect(register).toThrow(/未確定/);
    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: 8,
      },
      GROUP_ID,
    );
    await save("パン");
    expect(getItems()[0]).toMatchObject({
      taxRatePercent: 8,
      taxConfirmedFields: ["amountBasis", "taxRatePercent"],
      allocatedTaxYen: 40,
    });
    expect(register()[0].amountYen).toBe(540);
  },
);

it.each([false, true])(
  "原文あり=%s: 未保存の名前変更→税率選択→保存で、新しい商品の選択を保持する",
  async (raw) => {
    const { ctx, getItems, save, register } = fixture(raw);
    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: 8,
      },
      GROUP_ID,
    );
    await save("パン", 8);
    await save("パン");
    expect(getItems()[0]).toMatchObject({
      itemName: "パン",
      taxRatePercent: 8,
      allocatedTaxYen: 40,
      taxConfirmedFields: ["amountBasis", "taxRatePercent"],
      taxAllocationStatus: "allocated",
    });
    expect(register()[0].amountYen).toBe(540);
  },
);

it("行種別だけの変更でも税率確認を外し、変更のない行は保持する", async () => {
  const { getItems, save } = fixture(false);
  await save(" 日用品 ");
  expect(getItems()[0].taxConfirmedFields).toEqual(["amountBasis", "taxRatePercent"]);
  await save("日用品", undefined, "unknown");
  expect(getItems()[0].taxConfirmedFields).toEqual(["amountBasis"]);
  expect(getItems()[0].taxAllocationStatus).toBe("unallocated");
});

it("古い全体税率と変更後の商品確認が食い違う保存は、更新前に拒否する", async () => {
  const { ctx, getItems, getDraft } = fixture(false);
  await expect(
    updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 540,
      categoryId: CAT_ID,
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      items: [
        {
          itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
          itemName: "パン",
          amountYen: 540,
          categoryId: CAT_ID,
          confirmedTaxRatePercent: 8,
        },
      ],
    }),
  ).rejects.toThrow(/conflicts/);
  expect(getItems()[0]).toMatchObject({ itemName: "日用品", taxRatePercent: 10 });
  expect(getDraft().status).toBe("ready");
});

it("保存済み全体税率が再適用される旧callerでも、商品確認との競合を更新前に拒否する", async () => {
  const { ctx, getItems, getDraft } = fixture(false);
  await ctx.db.patch(DRAFT_ID, {
    receiptTaxDecision: {
      priceTaxTreatment: "included",
      taxRateComposition: "rate10",
      resolutionStatus: "verified",
      resolutionSource: "user",
      evidence: [],
      reasons: [],
      candidates: [],
      taxAmount: { roundingMethod: "round", source: "estimated", estimatedTaxYen: 49 },
    },
    receiptUserOverride: {
      source: "user",
      updatedAt: 1,
      fields: ["receiptTaxDecision.taxRateComposition"],
      values: {
        status: "ready",
        documentType: "receipt",
        confidence: {},
        warnings: [],
        reviewReasons: [],
        items: [],
      },
    },
  });
  await expect(
    updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 540,
      categoryId: CAT_ID,
      items: [
        {
          itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
          itemName: "パン",
          amountYen: 540,
          categoryId: CAT_ID,
          confirmedTaxRatePercent: 8,
        },
      ],
    }),
  ).rejects.toThrow(/conflicts/);
  expect(getItems()[0]).toMatchObject({ itemName: "日用品", taxRatePercent: 10 });
  expect(getDraft().receiptTaxDecision).toMatchObject({ taxRateComposition: "rate10" });
});
