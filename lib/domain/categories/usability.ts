/**
 * カテゴリがエントリに利用可能かを判定する知識。
 * 存在確認・グループ所属・isActive・「現行値なら非活性でも許容」の知識を集約する。
 */

/** 利用可否判定に必要なカテゴリの最小形状。 */
export type CategoryUsabilityTarget = {
  id: string;
  groupId: string;
  isActive: boolean;
};

export type CategoryUsabilityError = "not_found" | "wrong_group" | "inactive";

export type CategoryUsabilityOptions = {
  /** 現在値と同じカテゴリであれば、非活性でも許容する（既存レコードの維持用）。 */
  allowInactiveWhenUnchangedFrom?: string;
};

export type CategoryUsabilityResult =
  | { usable: true }
  | { usable: false; error: CategoryUsabilityError };

/**
 * カテゴリがエントリに利用可能かを判定する。
 * エラーメッセージの選択は呼び出し側（ユースケース/アダプタ）の責務とする。
 */
export function checkCategoryUsabilityForEntry(
  category: CategoryUsabilityTarget | null,
  groupId: string,
  options?: CategoryUsabilityOptions,
): CategoryUsabilityResult {
  if (category === null) {
    return { usable: false, error: "not_found" };
  }
  if (category.groupId !== groupId) {
    return { usable: false, error: "wrong_group" };
  }
  if (!category.isActive && options?.allowInactiveWhenUnchangedFrom !== category.id) {
    return { usable: false, error: "inactive" };
  }
  return { usable: true };
}
