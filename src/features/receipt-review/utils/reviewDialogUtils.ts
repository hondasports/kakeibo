import type { ReviewFormValues, ReviewItemValues } from "../types/types";
import type { AiExpenseQueueCategory } from "../../../types/aiExpenseQueue";
import { formatYen } from "../../../utils/currency";
import { hasLowConfidenceItem } from "../../../../lib/domain/aiExpenseDrafts/reviewItems";
import {
  computeReviewCategoryAggregates,
  computeReviewItemTotalYen,
  getReviewAttentionLabels as getReviewAttentionLabelsDomain,
  hasReviewLowConfidenceItems,
  hasReviewUncategorizedItems,
} from "../../../../lib/domain/aiExpenseDrafts/reviewSummary";

export type CategoryAggregateDisplay = {
  categoryId: string;
  categoryName: string;
  amountYen: number;
};

export const isLowConfidenceItem = hasLowConfidenceItem;

export function hasUncategorizedItems(reviewItems: ReviewItemValues[]): boolean {
  return hasReviewUncategorizedItems(reviewItems);
}

export function hasLowConfidenceItems(reviewItems: ReviewItemValues[]): boolean {
  return hasReviewLowConfidenceItems(reviewItems);
}

export function computeItemTotalYen(reviewItems: ReviewItemValues[]): number {
  return computeReviewItemTotalYen(reviewItems);
}

export function computeCategoryAggregates(
  reviewItems: ReviewItemValues[],
  categories: AiExpenseQueueCategory[],
): CategoryAggregateDisplay[] {
  return computeReviewCategoryAggregates(reviewItems, categories);
}

export function getReviewAttentionLabels({
  receiptAmountYen,
  reviewItems,
}: {
  receiptAmountYen: number;
  reviewItems: ReviewItemValues[];
}): string[] {
  return getReviewAttentionLabelsDomain({ receiptAmountYen, reviewItems });
}

export function formatReviewDraftHeader({
  date,
  amountYen,
}: Pick<ReviewFormValues, "date" | "amountYen">): string {
  const formattedDate = date ? date.replaceAll("-", "/") : "";
  const amount = Number(amountYen) || 0;
  const formattedAmount = formatYen(amount);

  if (formattedDate && amount > 0) {
    return `${formattedDate} ・ ${formattedAmount}`;
  }
  if (formattedDate) {
    return formattedDate;
  }
  if (amount > 0) {
    return formattedAmount;
  }
  return "";
}

export function resolveReviewShopName(
  reviewForm: ReviewFormValues,
  draftShopName?: string,
): string {
  return reviewForm.shopName.trim() || draftShopName?.trim() || "AI支出下書き";
}
