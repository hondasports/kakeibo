import { describe, expect, it } from "vitest";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import {
  buildReplacementDraftItemFields,
  getReviewItemReplaceErrorMessage,
  MAX_DRAFT_REVIEW_ITEMS,
  validateReviewItemCount,
  validateReviewItemIds,
} from "./reviewItemReplace";

describe("validateReviewItemCount", () => {
  it("100件までは許可し101件は拒否する", () => {
    expect(validateReviewItemCount(new Array(MAX_DRAFT_REVIEW_ITEMS).fill({}))).toEqual({
      success: true,
    });
    expect(validateReviewItemCount(new Array(101).fill({}))).toEqual({
      success: false,
      error: "too_many_items",
    });
  });
});

describe("validateReviewItemIds", () => {
  const existing = new Set(["a", "b"]);
  it("itemId 無しはスキップし既存IDは許可する", () => {
    expect(validateReviewItemIds([{}, { itemId: "a" }, { itemId: "b" }], existing)).toEqual({
      success: true,
    });
  });
  it("重複を先に検出する", () => {
    expect(validateReviewItemIds([{ itemId: "a" }, { itemId: "a" }], existing)).toEqual({
      success: false,
      error: "duplicate_item_id",
    });
  });
  it("存在しないIDを拒否する", () => {
    expect(validateReviewItemIds([{ itemId: "a" }, { itemId: "zzz" }], existing)).toEqual({
      success: false,
      error: "item_not_in_draft",
    });
  });
});

describe("buildReplacementDraftItemFields", () => {
  const base = { groupId: "g1", draftId: "d1", now: 99 };

  it("名前が空・金額不正は拒否する", () => {
    expect(
      buildReplacementDraftItemFields({
        ...base,
        item: { itemName: "  ", amountYen: 100, categoryId: "c1" },
        previous: undefined,
      }),
    ).toEqual({ success: false, error: "name_or_amount_required" });
    expect(
      buildReplacementDraftItemFields({
        ...base,
        item: { itemName: "商品", amountYen: -100, categoryId: "c1" },
        previous: undefined,
      }),
    ).toEqual({ success: false, error: "name_or_amount_required" });
  });

  it("previous 無しは既定 confidence・unallocated で構築する", () => {
    const result = buildReplacementDraftItemFields({
      ...base,
      item: { itemName: " 商品 ", amountYen: 300, categoryId: "c1" },
      previous: undefined,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.fields).toMatchObject({
      groupId: "g1",
      draftId: "d1",
      itemName: "商品",
      amountYen: 300,
      printedAmountYen: 300,
      categoryId: "c1",
      taxAllocationStatus: "unallocated",
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 99,
      updatedAt: 99,
    });
    expect(result.fields.amountBasis).toBeUndefined();
    expect(result.fields.normalizedAmountYen).toBeUndefined();
  });

  it("previous から税関連フィールドと lineType・warnings を継承する", () => {
    const previous: AiExpenseDraftItemFields = {
      groupId: "g1",
      draftId: "d1",
      itemName: "旧",
      lineType: "item",
      amountYen: 200,
      printedAmountYen: 200,
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      allocatedTaxYen: 16,
      normalizedAmountYen: 216,
      taxResolutionStatus: "resolved",
      warnings: ["w"],
      confidence: { itemName: 0.5 },
      createdAt: 1,
      updatedAt: 1,
    };
    const result = buildReplacementDraftItemFields({
      ...base,
      item: { itemId: "x", itemName: "残す商品", amountYen: 200, categoryId: "c1" },
      previous,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.fields).toMatchObject({
      lineType: "item",
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      allocatedTaxYen: 16,
      normalizedAmountYen: 216,
      taxResolutionStatus: "resolved",
      warnings: ["w"],
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    });
  });

  it("item.confidence / warnings 指定時はそれを優先する", () => {
    const result = buildReplacementDraftItemFields({
      ...base,
      item: {
        itemName: "商品",
        amountYen: 1,
        categoryId: "c1",
        confidence: { itemName: 0.2 },
        warnings: ["new"],
      },
      previous: undefined,
    });
    if (!result.success) throw new Error("expected success");
    expect(result.fields.confidence).toEqual({ itemName: 0.2 });
    expect(result.fields.warnings).toEqual(["new"]);
  });
});

describe("getReviewItemReplaceErrorMessage", () => {
  it("既存文言を返す", () => {
    expect(getReviewItemReplaceErrorMessage("too_many_items")).toBe(
      "Draft items must be 100 or fewer",
    );
    expect(getReviewItemReplaceErrorMessage("duplicate_item_id")).toBe(
      "Draft item ID must not be duplicated",
    );
    expect(getReviewItemReplaceErrorMessage("item_not_in_draft")).toBe(
      "Draft item does not belong to the current draft",
    );
    expect(getReviewItemReplaceErrorMessage("name_or_amount_required")).toBe(
      "Draft item name and amount are required",
    );
  });
});
