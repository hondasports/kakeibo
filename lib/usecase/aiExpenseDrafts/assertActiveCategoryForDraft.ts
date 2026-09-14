import { ConvexError } from "convex/values";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import {
  getReviewCategoryErrorMessage,
  validateReviewCategory,
} from "../../domain/aiExpenseDrafts/reviewCategory";

/**
 * レビュー済み下書きに利用可能なカテゴリか検証する。
 * 存在しない・他グループ所属は同一メッセージで拒否する（既存挙動）。
 */
export async function assertActiveCategoryForDraft(
  categories: CategoryRepository,
  categoryId: string,
  groupId: string,
): Promise<void> {
  const category = await categories.findById(categoryId);
  const result = validateReviewCategory(category, groupId);
  if (!result.success) {
    throw new ConvexError(getReviewCategoryErrorMessage(result.error));
  }
}
