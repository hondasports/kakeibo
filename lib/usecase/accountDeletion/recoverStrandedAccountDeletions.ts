/**
 * Clerk ユーザー削除済み（identityDeletedAt あり）で finalize に失敗し failed になった退会リクエストの自動復旧。
 * 本人はもうログインできず retryAccountDeletion を呼べないため、cron から同じ再開遷移で再駆動する。
 * identityDeletedAt が無い failed は本人が再試行できるので対象外。
 */
import type { AccountDeletionMutationDeps } from "./deps";
import { resumeFailedAccountDeletion } from "./resumeFailedAccountDeletion";

/** 1 回の実行で再駆動する最大件数。 */
export const STRANDED_RECOVERY_BATCH_SIZE = 10;
/** failed を新しい順に走査する最大件数（identity 未削除の failed が枠を占有しても進めるため再駆動件数より広く読む）。 */
export const STRANDED_RECOVERY_SCAN_LIMIT = 100;
/** identityDeletedAt からこの期間を過ぎた failed は自動復旧せず、運用者向けにエラーログだけ残す（14 日）。 */
export const STRANDED_RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export async function recoverStrandedAccountDeletions(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
): Promise<{ recovered: number; expired: number }> {
  const now = Date.now();
  const failed = await deps.requests.listFailed(STRANDED_RECOVERY_SCAN_LIMIT);
  let recovered = 0;
  let expired = 0;
  for (const request of failed) {
    if (!request.identityDeletedAt) continue;
    if (now - request.identityDeletedAt > STRANDED_RECOVERY_MAX_AGE_MS) {
      expired += 1;
      console.error("Account deletion recovery abandoned", {
        requestId: request.id,
        identityDeletedAt: request.identityDeletedAt,
        lastErrorCode: request.lastErrorCode,
        maxAgeDays: STRANDED_RECOVERY_MAX_AGE_MS / (24 * 60 * 60 * 1000),
      });
      continue;
    }
    if (recovered >= STRANDED_RECOVERY_BATCH_SIZE) continue;
    await resumeFailedAccountDeletion(deps, request);
    recovered += 1;
  }
  return { recovered, expired };
}
