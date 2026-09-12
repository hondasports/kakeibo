import { ConvexError } from "convex/values";
import { checkCategoryUsabilityForEntry } from "../../domain/categories/usability";
import type {
  CategoryRecord,
  CategoryRepository,
} from "../../domain/categories/categoryRepository";

/**
 * カテゴリを取得し、指定グループのエントリに利用可能か検証する。
 * 利用不可なら既存と同じメッセージの ConvexError を投げる。
 */
export async function assertUsableCategory(
  categories: CategoryRepository,
  categoryId: string,
  groupId: string,
  options?: {
    inactiveErrorMessage?: string;
    allowInactiveWhenUnchangedFrom?: string;
  },
): Promise<CategoryRecord> {
  const category = await categories.findById(categoryId);
  if (category === null) {
    throw new ConvexError("Category not found");
  }
  const result = checkCategoryUsabilityForEntry(category, groupId, {
    allowInactiveWhenUnchangedFrom: options?.allowInactiveWhenUnchangedFrom,
  });
  if (!result.usable) {
    if (result.error === "wrong_group") {
      throw new ConvexError("Category does not belong to the current group");
    }
    throw new ConvexError(
      options?.inactiveErrorMessage ?? "Inactive category cannot be used for new expense entries",
    );
  }
  return category;
}
