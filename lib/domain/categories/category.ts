/**
 * カテゴリに関するドメインルール。
 * UI / Convex の両方から利用できる純粋関数のみを含む。
 */

/** カテゴリ名の最大文字数。 */
export const MAX_CATEGORY_NAME_LENGTH = 40;

/** カテゴリ説明の最大文字数。 */
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 200;

/** カテゴリ名の検証失敗理由。 */
type CategoryNameError = "empty" | "too_long";

/**
 * カテゴリ名を trim し、空文字・長さ超過を検証する。
 */
export function validateCategoryName(
  name: string,
): { success: true; name: string } | { success: false; error: CategoryNameError } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "empty" };
  }
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, name: trimmed };
}

/** カテゴリカラーの検証失敗理由。 */
type CategoryColorError = "invalid_hex";

/**
 * カテゴリカラーを trim し、6 桁の hex 値かどうか検証する。
 */
export function validateCategoryColor(
  color: string,
): { success: true; color: string } | { success: false; error: CategoryColorError } {
  const trimmed = color.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return { success: false, error: "invalid_hex" };
  }
  return { success: true, color: trimmed.toUpperCase() };
}

/** カテゴリ説明の検証失敗理由。 */
type CategoryDescriptionError = "too_long";

/**
 * カテゴリ説明が指定されていれば長さを検証する。
 */
export function validateCategoryDescription(
  description: string | undefined,
): { success: true; description?: string } | { success: false; error: CategoryDescriptionError } {
  if (description !== undefined && description.length > MAX_CATEGORY_DESCRIPTION_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, description };
}
