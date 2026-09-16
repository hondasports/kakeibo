/**
 * Clerk 削除エラーの分類ルール（純粋ドメイン関数）。
 * 404 は削除済みとして扱い、429/5xx/不明ステータスはリトライ可能とする。
 */
export type ClerkDeletionErrorResult =
  | { kind: "already_deleted" }
  | { kind: "retryable"; code: string; message: string }
  | { kind: "failed"; code: string; message: string };

export function classifyClerkDeletionError(error: unknown): ClerkDeletionErrorResult {
  const status =
    typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (status === 404) return { kind: "already_deleted" as const };
  if (status === 429 || status >= 500 || status === 0)
    return {
      kind: "retryable" as const,
      code: "identity_deletion_failed",
      message: "アカウント削除を完了できませんでした。時間をおいて再試行してください。",
    };
  return {
    kind: "failed" as const,
    code: "identity_deletion_failed",
    message: "アカウント削除を完了できませんでした。もう一度お試しください。",
  };
}
