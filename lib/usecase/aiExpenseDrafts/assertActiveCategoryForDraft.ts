import { ConvexError } from "convex/values";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";

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
  if (category === null || category.groupId !== groupId) {
    throw new ConvexError("Category does not belong to the current group");
  }
  if (!category.isActive) {
    throw new ConvexError("Inactive category cannot be used for reviewed drafts");
  }
}
