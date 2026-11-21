/**
 * グループ名に関するドメインルール。
 * UI / Convex の両方から利用できる純粋関数のみを含む。
 */

/** グループ名の最大文字数（作成・変更で共通）。 */
export const MAX_GROUP_NAME_LENGTH = 50;

/** グループ名検証の失敗理由。 */
type GroupNameValidationError = { type: "empty" } | { type: "too_long"; maxLength: number };

/** 検証結果。 */
type GroupNameValidationResult =
  | { success: true; name: string }
  | { success: false; error: GroupNameValidationError };

/**
 * グループ名を trim し、空文字・長さ超過を検証する。
 * 表示メッセージは呼び出し側に委ね、戻り値の失敗理由で判定する。
 */
export function validateGroupName(name: string): GroupNameValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { success: false, error: { type: "empty" } };
  }
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return { success: false, error: { type: "too_long", maxLength: MAX_GROUP_NAME_LENGTH } };
  }
  return { success: true, name: trimmed };
}
