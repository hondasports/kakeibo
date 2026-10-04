import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  updateForReviewHandler,
  updateDraftItemTaxOverridesMutationHandler,
} from "../../../convex/aiExpenseDrafts/mutations";
import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import {
  receiptTaxBasisCases,
  receiptTaxBasisInput,
} from "../../domain/receipt/tax/fixtures/receiptTaxBasisCases";
import { GROUP_ID, DRAFT_ID, CAT_ID, createInMemoryMutationCtx } from "./testHelpers";

function setup(testCase: (typeof receiptTaxBasisCases)[number]) {
  const input = receiptTaxBasisInput(testCase);
  return createInMemoryMutationCtx({
    draft: {
      _id: DRAFT_ID,
      groupId: GROUP_ID,
      status: "needs_review",
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-04",
      amountYen: input.amountYen,
      categoryId: CAT_ID,
      confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      taxSummaries: input.taxSummaries,
      warnings: [],
      reviewReasons: ["user_confirmation_required"],
      createdAt: 1,
      updatedAt: 1,
    },
    items: input.items.map((item, index) => ({
      ...item,
      _id: `item-${index}`,
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      amountYen: item.printedAmountYen,
      amountBasis: "tax_included",
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      taxAllocationStatus: "unallocated",
      allocatedTaxYen: 0,
      normalizedAmountYen: item.printedAmountYen,
      categoryId: CAT_ID,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    })),
  });
}

describe("Issue #890: 補正・保存・再表示・登録境界", () => {
  it.each(receiptTaxBasisCases)(
    "税込対象額$paidYen 円を保持したまま保存・登録できる",
    async (testCase) => {
      const { ctx, getDraft, getItems } = setup(testCase);
      const printedSummary = structuredClone(getDraft().taxSummaries);
      for (const item of getItems()) {
        await updateDraftItemTaxOverridesMutationHandler(ctx, {
          draftId: DRAFT_ID,
          itemId: item._id as Id<"aiExpenseDraftItems">,
          amountBasis: "tax_excluded",
        });
      }
      const save = () =>
        updateForReviewHandler(ctx, {
          draftId: DRAFT_ID,
          documentType: "receipt",
          shopName: "テスト店",
          date: "2026-10-04",
          amountYen: testCase.paidYen,
          categoryId: CAT_ID,
          items: getItems().map((item) => ({
            itemId: item._id as Id<"aiExpenseDraftItems">,
            itemName: String(item.itemName),
            amountYen: Number(item.printedAmountYen),
            categoryId: CAT_ID,
          })),
        });
      await save();
      await save();
      expect(getDraft().status).toBe("ready");
      expect(getItems().map((item) => item.printedAmountYen)).toEqual(testCase.amounts);
      expect(getItems().map((item) => item.allocatedTaxYen)).toEqual(testCase.allocations);
      expect(
        getItems().every(
          (item) => item.amountBasis === "tax_excluded" && item.taxAllocationStatus === "allocated",
        ),
      ).toBe(true);
      expect(getDraft().taxSummaries).toMatchObject(printedSummary!);
      const entries = buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      );
      expect(entries.reduce((sum, item) => sum + item.amountYen, 0)).toBe(testCase.paidYen);
      expect(() =>
        buildDraftRegistrationItems(
          getDraft() as unknown as Doc<"aiExpenseDrafts">,
          getItems().map((item) => ({
            ...item,
            normalizedAmountYen: Number(item.normalizedAmountYen) + 1,
          })) as unknown as Doc<"aiExpenseDraftItems">[],
        ),
      ).toThrow("税込登録額が未確定");
    },
  );
});
