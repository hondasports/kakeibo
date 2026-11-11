import { describe, expect, it } from "vitest";
import { mapDraftItemsToReviewItems } from "./reviewDraftMapping";
import {
  getReviewDiscountTargetForSubmit,
  initializeReviewCategoryState,
} from "./reviewItemCategories";

describe("割引対象の保存と復元", () => {
  it("保存対象を優先し、対象のない旧明細だけ推定する", () => {
    const items = [
      { _id: "a", itemName: "商品A", amountYen: 100, categoryId: "food" },
      {
        _id: "b",
        itemName: "クーポン",
        lineType: "promotion_adjustment" as const,
        amountYen: -10,
        categoryId: "food",
        discountTargetItemId: "c",
      },
      { _id: "c", itemName: "商品C", amountYen: 108, categoryId: "food" },
    ];
    const saved = initializeReviewCategoryState(mapDraftItemsToReviewItems(items), "food");
    expect(saved.items[1].discountTargetItemId).toBe("c");
    const legacy = initializeReviewCategoryState(
      mapDraftItemsToReviewItems(items.map(({ discountTargetItemId: _target, ...item }) => item)),
      "food",
    );
    expect(legacy.items[1].discountTargetItemId).toBe("a");
  });
});

import { buildReviewChecks } from "./reviewChecks";
import { isAmountAndTaxResolved } from "./reviewJudgment";
import type { AiExpenseDraftJudgmentInput } from "./reviewTypes";

it("選択した商品で税率別照合と一覧判定を行う", () => {
  const base = {
    amountBasis: "tax_included" as const,
    taxAllocationStatus: "allocated" as const,
    taxResolutionStatus: "resolved" as const,
    taxResolutionSource: "item_explicit" as const,
    categoryId: "food",
  };
  const items = [
    {
      ...base,
      _id: "a",
      itemName: "商品A",
      amountYen: 100,
      printedAmountYen: 100,
      normalizedAmountYen: 100,
      taxRatePercent: 8 as const,
    },
    {
      ...base,
      _id: "b",
      itemName: "クーポン",
      lineType: "promotion_adjustment" as const,
      amountYen: -10,
      printedAmountYen: -10,
      normalizedAmountYen: -10,
      taxRatePercent: 10 as const,
    },
    {
      ...base,
      _id: "c",
      itemName: "商品C",
      amountYen: 108,
      printedAmountYen: 108,
      normalizedAmountYen: 108,
      taxRatePercent: 10 as const,
    },
  ];
  const taxSummaries = [
    {
      taxRatePercent: 8 as const,
      taxMode: "included" as const,
      taxableAmountYen: 100,
      taxableAmountBasis: "tax_included" as const,
      taxYen: 7,
      roundingMethod: "unknown" as const,
      status: "verified" as const,
      warnings: [],
    },
    {
      taxRatePercent: 10 as const,
      taxMode: "included" as const,
      taxableAmountYen: 98,
      taxableAmountBasis: "tax_included" as const,
      taxYen: 9,
      roundingMethod: "unknown" as const,
      status: "verified" as const,
      warnings: [],
    },
  ];
  const legacy = initializeReviewCategoryState(mapDraftItemsToReviewItems(items), "food");
  expect(legacy.items[1].discountTargetItemId).toBe("a");
  expect(
    buildReviewChecks({ items: legacy.items, paidTotalYen: 198, taxSummaries }).taxRate.status,
  ).not.toBe("matched");
  const savedItems = items.map((item) =>
    item._id === "b" ? { ...item, discountTargetItemId: "c" } : item,
  );
  const reopened = initializeReviewCategoryState(mapDraftItemsToReviewItems(savedItems), "food");
  expect(reopened.items[1].discountTargetItemId).toBe("c");
  expect(
    buildReviewChecks({ items: reopened.items, paidTotalYen: 198, taxSummaries }).taxRate.status,
  ).toBe("matched");
  const draft: AiExpenseDraftJudgmentInput = {
    documentType: "receipt",
    shopName: "店",
    date: "2026-11-01",
    amountYen: 198,
    categoryId: "food",
    reviewReasons: [],
    taxSummaries,
    items,
  };
  expect(isAmountAndTaxResolved(draft)).toBe(false);
  expect(isAmountAndTaxResolved({ ...draft, items: savedItems })).toBe(true);
});

it("保存済みIDまたは送信順の位置で対象を組み立てる", () => {
  const items = initializeReviewCategoryState(
    mapDraftItemsToReviewItems([
      { _id: "a", itemName: "商品", amountYen: 100 },
      { _id: "b", itemName: "クーポン", lineType: "discount", amountYen: -10 },
      { itemName: "新規", amountYen: 108 },
    ]),
    "food",
  ).items;
  expect(getReviewDiscountTargetForSubmit(items, items[1])).toEqual({ itemId: "a" });
  expect(
    getReviewDiscountTargetForSubmit(items, { ...items[1], discountTargetItemId: items[2].id }),
  ).toEqual({ itemIndex: 2 });
  expect(
    getReviewDiscountTargetForSubmit(items, { ...items[1], discountTargetItemId: undefined }),
  ).toBeNull();
});

import { snapshotReceiptDraftValues } from "./receiptDataContract";

it("再解析のユーザー補正に対象位置を保存する", () => {
  const draft = {
    status: "needs_review" as const,
    documentType: "receipt" as const,
    confidence: {},
    reviewReasons: [],
  };
  const items = [
    { _id: "a", itemName: "商品", amountYen: 100, confidence: {} },
    {
      _id: "b",
      itemName: "クーポン",
      lineType: "discount" as const,
      amountYen: -10,
      discountTargetItemId: "a",
      confidence: {},
    },
  ];
  expect(
    snapshotReceiptDraftValues(draft, items, { includeDiscountTargets: true }).items[1],
  ).toMatchObject({ discountTargetItemIndex: 0 });
});

import { buildReplacementDraftItemFields } from "./reviewItemReplace";

it("置換明細の構築時に以前の対象を引き継ぐ", () => {
  const previous = {
    id: "b",
    groupId: "g",
    draftId: "d",
    itemName: "クーポン",
    lineType: "discount" as const,
    amountYen: -10,
    discountTargetItemId: "a",
    confidence: {},
    createdAt: 1,
    updatedAt: 1,
  };
  const result = buildReplacementDraftItemFields({
    groupId: "g",
    draftId: "d",
    previous,
    now: 2,
    item: {
      itemId: "b",
      itemName: "クーポン",
      lineType: "discount",
      amountYen: -10,
      categoryId: "food",
    },
  });
  expect(result.success && result.fields.discountTargetItemId).toBe("a");
});

it.each([
  ["存在しない対象", "missing", "discount"],
  ["割引行を対象", "b", "discount"],
  ["商品行に付いた対象", "a", "item"],
] as const)("%s の送信値は null にする", (_label, targetId, lineType) => {
  const items = initializeReviewCategoryState(
    mapDraftItemsToReviewItems([
      { _id: "a", itemName: "商品", amountYen: 100 },
      { _id: "b", itemName: "値引", lineType: "discount", amountYen: -10 },
    ]),
    "food",
  ).items;
  expect(
    getReviewDiscountTargetForSubmit(items, {
      ...items[1],
      lineType,
      discountTargetItemId: targetId,
    }),
  ).toBeNull();
});
