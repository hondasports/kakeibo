export const MAX_REASON_LENGTH = 500;

type NormalizeReasonError = "empty" | "too_long";

const normalizeReasonErrorMessages: Record<NormalizeReasonError, string> = {
  empty: "理由は1〜500文字で入力してください",
  too_long: "理由は1〜500文字で入力してください",
};

/** システム管理者用理由の検証エラーをユーザー向けメッセージに変換する */
export function getNormalizeReasonErrorMessage(error: NormalizeReasonError): string {
  return normalizeReasonErrorMessages[error];
}

export function normalizeSystemAdminReason(
  reason: string,
): { success: true; reason: string } | { success: false; error: NormalizeReasonError } {
  const normalized = reason.trim();
  if (normalized.length < 1) {
    return { success: false, error: "empty" };
  }
  if (normalized.length > MAX_REASON_LENGTH) {
    return { success: false, error: "too_long" };
  }
  return { success: true, reason: normalized };
}
