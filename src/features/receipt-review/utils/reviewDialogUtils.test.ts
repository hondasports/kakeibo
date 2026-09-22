import { describe, expect, it } from "vitest";
import {
  computeCategoryAggregates,
  formatReviewDraftHeader,
  getReviewAttentionLabels,
  hasLowConfidenceItems,
  hasUncategorizedItems,
  isLowConfidenceItem,
} from "./reviewDialogUtils";
import type { ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../ai-expense-queue/types/types";

const categories: AiExpenseQueueCategory[] = [
  { _id: "cat-food", name: "食費", color: "#AAB7C4" },
  { _id: "cat-medical", name: "医療費", color: "#C4A6B2" },
];

describe("reviewDialogUtils", () => {
  it("明細をカテゴリ別に集約する", () => {
    const items: ReviewItemValues[] = [
      { id: "1", itemName: "パン", amountYen: "150", categoryId: "cat-food" },
      { id: "2", itemName: "牛乳", amountYen: "250", categoryId: "cat-food" },
      { id: "3", itemName: "胃薬", amountYen: "980", categoryId: "cat-medical" },
    ];

    expect(computeCategoryAggregates(items, categories)).toEqual([
      { categoryId: "cat-food", categoryName: "食費", amountYen: 400 },
      { categoryId: "cat-medical", categoryName: "医療費", amountYen: 980 },
    ]);
  });

  it("未分類明細は集約対象に含めない", () => {
    const items: ReviewItemValues[] = [
      { id: "1", itemName: "パン", amountYen: "150", categoryId: "cat-food" },
      { id: "2", itemName: "不明", amountYen: "100", categoryId: "" },
    ];

    expect(computeCategoryAggregates(items, categories)).toEqual([
      { categoryId: "cat-food", categoryName: "食費", amountYen: 150 },
    ]);
    expect(hasUncategorizedItems(items)).toBe(true);
  });

  it("割引明細を同一カテゴリの正味額へ集約する", () => {
    const items: ReviewItemValues[] = [
      { id: "1", itemName: "キュレル ジェルメイク", amountYen: "1100", categoryId: "cat-medical" },
      { id: "2", itemName: "クーポン券割引", amountYen: "-110", categoryId: "cat-medical" },
    ];

    expect(computeCategoryAggregates(items, categories)).toEqual([
      { categoryId: "cat-medical", categoryName: "医療費", amountYen: 990 },
    ]);
  });

  it("低信頼度明細を判定する", () => {
    const item: ReviewItemValues = {
      id: "1",
      itemName: "胃薬",
      amountYen: "980",
      categoryId: "cat-medical",
      confidence: { categoryName: 0.5 },
    };

    expect(isLowConfidenceItem(item)).toBe(true);
    expect(hasLowConfidenceItems([item])).toBe(true);
  });

  it("差額と未分類・低信頼度の注意ラベルを返す", () => {
    const items: ReviewItemValues[] = [
      {
        id: "1",
        itemName: "胃薬",
        amountYen: "980",
        categoryId: "",
        confidence: { categoryName: 0.5 },
      },
    ];

    expect(getReviewAttentionLabels({ receiptAmountYen: 1380, reviewItems: items })).toEqual([
      "未分類の明細があります",
      "低信頼度の明細があります",
      "明細合計と合計金額に差額があります",
    ]);
  });

  it("下書きヘッダーを日付と金額付きで整形する", () => {
    expect(
      formatReviewDraftHeader({
        date: "2026-06-21",
        amountYen: "1380",
      }),
    ).toBe("2026/06/21 ・ 1,380円");
  });
});
