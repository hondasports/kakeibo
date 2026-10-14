import { describe, it, expect } from "vitest";
import { mergeReviewTaxItems } from "./reviewTaxItemMerge";
import type { ReviewItemValues } from "../types/types";

describe("税情報更新時の入力保持", () => {
  it("割引対象・編集中の値・追加行を保持し、削除行を復活させない", () => {
    const current: ReviewItemValues[] = [
      {
        id: "food",
        itemName: "編集済み",
        amountYen: "116",
        categoryId: "food",
        taxRatePercent: 10,
      },
      {
        id: "discount",
        itemName: "割引",
        amountYen: "-24",
        categoryId: "food",
        discountTargetItemId: "food",
      },
      { id: "new", itemName: "追加", amountYen: "20", categoryId: "daily" },
    ];
    const result = mergeReviewTaxItems(current, [
      {
        ...current[0],
        itemName: "サーバー名",
        amountYen: "999",
        categoryId: "daily",
        taxRatePercent: 8,
      },
      { ...current[1], discountTargetItemId: undefined },
      { id: "removed", itemName: "削除済み", amountYen: "100", categoryId: "daily" },
    ]);
    expect(result.map((item) => item.id)).toEqual(["food", "discount", "new"]);
    expect(result[0]).toMatchObject({
      itemName: "編集済み",
      amountYen: "116",
      categoryId: "food",
      taxRatePercent: 8,
    });
    expect(result[1].discountTargetItemId).toBe("food");
    expect(result[0].normalizedAmountYen).toBeUndefined();
    expect(result[0].allocatedTaxYen).toBeUndefined();
    expect(result[0].taxResolutionStatus).toBe("unresolved");
  });
  it("印字額が同じならサーバーで再計算した税額を反映する", () => {
    const current: ReviewItemValues = {
      id: "food",
      itemName: "パン",
      amountYen: "100",
      categoryId: "food",
    };
    expect(
      mergeReviewTaxItems(
        [current],
        [
          {
            ...current,
            amountBasis: "tax_excluded",
            taxRatePercent: 8,
            normalizedAmountYen: 108,
            allocatedTaxYen: 8,
            taxResolutionStatus: "resolved",
          },
        ],
      )[0],
    ).toMatchObject({
      normalizedAmountYen: 108,
      allocatedTaxYen: 8,
      taxResolutionStatus: "resolved",
    });
  });
});

it("名前変更後に選んだ税率だけを今回の確認として保持し、応答待ち中の別名変更には引き継がない", () => {
  const current: ReviewItemValues = {
    id: "item",
    itemName: "パン",
    lineType: "item",
    amountYen: "100",
    printedAmountYen: 100,
    categoryId: "cat",
    amountBasis: "tax_included",
    taxRatePercent: 10,
    taxConfirmedFields: ["amountBasis"],
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["item_identity_changed"],
  };
  const server: ReviewItemValues = {
    ...current,
    itemName: "日用品",
    taxRatePercent: 8,
    taxReviewReasons: [],
    taxConfirmedFields: ["amountBasis", "taxRatePercent"],
    taxResolutionStatus: "resolved",
  };
  expect(mergeReviewTaxItems([current], [server])[0].taxReviewReasons).toContain(
    "item_identity_changed",
  );
  const request = {
    id: "item",
    itemName: "パン",
    lineType: "item" as const,
    taxRatePercent: 8 as const,
  };
  expect(mergeReviewTaxItems([current], [server], [request])[0]).toMatchObject({
    itemName: "パン",
    confirmedTaxRatePercent: 8,
    taxConfirmedFields: ["amountBasis", "taxRatePercent"],
    taxReviewReasons: [],
  });
  expect(
    mergeReviewTaxItems([{ ...current, itemName: "お酒" }], [server], [request])[0],
  ).toMatchObject({
    itemName: "お酒",
    taxConfirmedFields: ["amountBasis"],
    taxReviewReasons: ["item_identity_changed"],
  });
});
