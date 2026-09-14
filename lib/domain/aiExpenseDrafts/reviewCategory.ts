/**
 * レビュー済み下書きに利用できるカテゴリかを判定する純粋ルール。
 * usecase / infra の双方から利用し、判定ロジックを一箇所に集約する。
 */

export type ReviewCategoryError = "not_in_group" | "inactive";

const reviewCategoryErrorMessages: Record<ReviewCategoryError, string> = {
  not_in_group: "Category does not belong to the current group",
  inactive: "Inactive category cannot be used for reviewed drafts",
};

export function getReviewCategoryErrorMessage(error: ReviewCategoryError): string {
  return reviewCategoryErrorMessages[error];
}

/**
 * 存在しない・他グループ所属は同一エラーで拒否する（既存挙動）。
 */
export function validateReviewCategory(
  category: { groupId: string; isActive: boolean } | null,
  groupId: string,
): { success: true } | { success: false; error: ReviewCategoryError } {
  if (category === null || category.groupId !== groupId) {
    return { success: false, error: "not_in_group" };
  }
  if (!category.isActive) {
    return { success: false, error: "inactive" };
  }
  return { success: true };
}
