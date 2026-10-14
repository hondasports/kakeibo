import { expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { GROUP_ID, DRAFT_ID, CAT_ID, createInMemoryMutationCtx } from "./testHelpers";
import { updateDraftItemTaxOverridesHandler } from "./updateItemTaxOverrides";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";
import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import { buildReviewTaxPreview } from "../../../src/features/receipt-review/utils/reviewItemsTaxPreview";
import { mapDraftItemsToReviewItems } from "../../../src/features/receipt-review/utils/mappers";

it.each([false, true])(
  "逆順=%sでも片軸確認→保存→残り確認→再表示→登録で確認情報を失わない",
  async (reverse) => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        sourceType: "image_upload",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-10-14",
        amountYen: 4810,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: [],
        createdAt: 0,
        updatedAt: 0,
      },
      items: [
        {
          _id: "item-original",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品",
          printedAmountYen: 4810,
          amountYen: 4810,
          amountBasis: "tax_included",
          taxRatePercent: 10,
          taxResolutionStatus: "unresolved",
          taxResolutionSource: "single_summary",
          categoryId: CAT_ID,
          confidence: {},
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const choices = [{ taxRatePercent: 10 } as const, { amountBasis: "tax_included" } as const];
    if (reverse) choices.reverse();
    const save = () =>
      updateForReviewHandler(ctx, {
        draftId: DRAFT_ID,
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-10-14",
        amountYen: 4810,
        categoryId: CAT_ID,
        items: getItems().map((item) => ({
          itemId: item._id as Id<"aiExpenseDraftItems">,
          itemName: "商品",
          amountYen: 4810,
          categoryId: CAT_ID,
        })),
      });
    for (const [index, choice] of choices.entries()) {
      await updateDraftItemTaxOverridesHandler(
        ctx,
        { draftId: DRAFT_ID, itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">, ...choice },
        GROUP_ID,
      );
      await save();
      expect(getItems()[0].taxConfirmedFields).toHaveLength(index + 1);
      expect(getDraft().status).toBe(index === 0 ? "needs_review" : "ready");
      if (index === 0)
        expect(() =>
          buildDraftRegistrationItems(
            getDraft() as unknown as Doc<"aiExpenseDrafts">,
            getItems() as unknown as Doc<"aiExpenseDraftItems">[],
          ),
        ).toThrow(/未確定/);
    }
    const saved = getItems() as unknown as Doc<"aiExpenseDraftItems">[];
    const preview = buildReviewTaxPreview(mapDraftItemsToReviewItems(saved), {
      paidTotalYen: 4810,
      taxSummaries: getDraft().taxSummaries as never,
      receiptTotalResolution: getDraft().receiptTotalResolution as never,
    });
    expect(preview.items[0]).toMatchObject({
      taxAllocationStatus: "allocated",
      normalizedAmountYen: 4810,
      taxConfirmedFields: ["amountBasis", "taxRatePercent"],
    });
    expect(
      buildDraftRegistrationItems(getDraft() as unknown as Doc<"aiExpenseDrafts">, saved)[0]
        .amountYen,
    ).toBe(4810);
    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: null,
      },
      GROUP_ID,
    );
    expect(getItems()[0].taxConfirmedFields).toEqual(["amountBasis"]);
    expect(() =>
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      ),
    ).toThrow(/未確定/);
  },
);
