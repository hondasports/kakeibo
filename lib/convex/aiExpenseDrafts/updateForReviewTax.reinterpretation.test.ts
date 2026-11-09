import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  updateForReviewHandler,
  updateDraftItemTaxOverridesMutationHandler,
} from "../../../convex/aiExpenseDrafts/mutations";
import { applyReceiptTaxSettingsHandler } from "./applyReceiptTaxSettings";
import { replaceDraftItemsForReview } from "./reviewValidation";
import {
  GROUP_ID,
  DRAFT_ID,
  CAT_ID,
  createInMemoryMutationCtx,
  externalTaxSummaries,
} from "./testHelpers";

describe("updateForReviewHandler tax reinterpretation (tax reinterpretation)", () => {
  it("税情報がない下書きでは旧引数から税設定を作らない", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-08-27",
        amountYen: 1100,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品",
          amountYen: 1000,
          printedAmountYen: 1000,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
    });

    expect(getDraft().receiptTaxDecision).toBeUndefined();
    expect(getItems()[0].amountBasis).toBeUndefined();
    expect(getItems()[0].taxRatePercent).toBeUndefined();
  });

  it("旧引数は明細や登録モードを変更しない", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-08-27",
        amountYen: 1100,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: [
          {
            taxRatePercent: 10,
            taxMode: "external",
            taxableAmountYen: 1000,
            taxableAmountBasis: "tax_excluded",
            taxYen: 100,
            roundingMethod: "unknown",
            confidence: {},
            warnings: [],
            status: "verified",
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
          itemName: "商品",
          amountYen: 1000,
          printedAmountYen: 1000,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
      items: [
        {
          itemId: "item-1" as Id<"aiExpenseDraftItems">,
          itemName: "商品",
          amountYen: 1000,
          categoryId: CAT_ID,
        },
      ],
    });

    expect(getDraft().receiptUserOverride!.fields).not.toContain(
      "receiptTaxDecision.priceTaxTreatment",
    );
    expect(getDraft().receiptUserOverride!.fields).not.toContain(
      "receiptTaxDecision.taxRateComposition",
    );
    const before = { basis: getItems()[0].amountBasis, rate: getItems()[0].taxRatePercent };

    const withLegacyUnknown = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
    });
    expect(withLegacyUnknown.registrationMode).toBe("detailed");
    expect(getItems()[0]).toMatchObject({ amountBasis: before.basis, taxRatePercent: before.rate });

    const detailed = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
    });
    expect(detailed.registrationMode).toBe("detailed");
  });

  it("削除・並べ替え・追加後も税情報を元の itemId にだけ引き継ぐ", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
      },
      items: [
        {
          _id: "item-a",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "削除する商品",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          amountBasis: "tax_included",
          taxRatePercent: 10,
          taxResolutionStatus: "resolved",
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "item-b",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "残す商品",
          amountYen: 200,
          printedAmountYen: 200,
          categoryId: CAT_ID,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          allocatedTaxYen: 16,
          normalizedAmountYen: 216,
          taxResolutionStatus: "resolved",
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });

    await replaceDraftItemsForReview(
      ctx,
      DRAFT_ID,
      GROUP_ID,
      [
        {
          itemId: "item-b" as Id<"aiExpenseDraftItems">,
          itemName: "残す商品",
          amountYen: 200,
          categoryId: CAT_ID,
        },
        {
          itemName: "追加商品",
          amountYen: 300,
          categoryId: CAT_ID,
        },
      ] as Parameters<typeof replaceDraftItemsForReview>[3],
      3,
    );

    const remaining = getItems().find((item) => item.itemName === "残す商品");
    const added = getItems().find((item) => item.itemName === "追加商品");
    expect(remaining).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      allocatedTaxYen: 16,
      normalizedAmountYen: 216,
    });
    expect(added?.amountBasis).toBeUndefined();
    expect(added?.taxRatePercent).toBeUndefined();
    expect(added?.allocatedTaxYen).toBeUndefined();
  });

  it("税サマリ付き下書きの明細更新後も税再解釈を実行し printedAmountYen を保持する", async () => {
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
          amountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("needs_review");
    await updateDraftItemTaxOverridesMutationHandler(ctx, {
      draftId: DRAFT_ID,
      itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
    });
    const confirmed = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
    });
    expect(confirmed.status).toBe("ready");
    const items = getItems();
    expect(items[0]?.printedAmountYen).toBe(100);
    expect(items[0]?.taxResolutionStatus).toBe("resolved");
    expect(getDraft().taxSummaries).toBeDefined();
  });

  it("外税レシートで一括適用後の明細手修正でも税状態が維持され ready になり得る", async () => {
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
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await applyReceiptTaxSettingsHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    const afterBulk = getItems();
    expect(afterBulk[0]?.taxResolutionStatus).toBe("resolved");

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
          itemId: afterBulk[0]._id as Id<"aiExpenseDraftItems">,
          amountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("ready");
    expect(getItems()[0]?.taxResolutionStatus).toBe("resolved");
  });

  it("明細のみ修正で支払合計と不一致が残る場合は needs_review のまま", async () => {
    const { ctx, getDraft } = createInMemoryMutationCtx({
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
        reviewReasons: [],
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
          amountYen: 90,
          printedAmountYen: 90,
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
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 90,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("needs_review");
    expect(getDraft().reviewReasons).toContain("amount_mismatch");
  });
});
