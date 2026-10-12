/**
 * Clerk ユーザー削除済み（identityDeletedAt あり）で finalize に失敗し failed になった退会リクエストの自動復旧。
 * 本人はもうログインできず retryAccountDeletion を呼べないため、cron から同じ再開遷移で再駆動する。
 * identityDeletedAt が無い failed は本人が再試行できるので対象外（index で読まない）。
 */
import type { AccountDeletionMutationDeps } from "./deps";
import { resumeFailedAccountDeletion } from "./resumeFailedAccountDeletion";

/** 1 回の実行で再駆動する最大件数。 */
export const STRANDED_RECOVERY_BATCH_SIZE = 10;
/**
 * 復旧候補として 1 回に読む最大件数（ローテーション用）。
 * 候補を updatedAt 昇順（最後に触った時刻が古い順）に並べ替えてから先頭 BATCH_SIZE 件を再駆動するため、
 * 再駆動して再び failed に戻った行（updatedAt が更新済み）は後ろへ回り、他の行が飢えない。
 * 上限に達したら候補が飽和しているため、運用者向けに console.error で警告する。
 */
export const STRANDED_RECOVERY_CANDIDATE_CAP = 200;
/** identityDeletedAt からこの期間を過ぎた failed は自動復旧せず、運用者向けにエラーログだけ残す（14 日）。 */
export const STRANDED_RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/**
 * 1 回の実行でエラーログに出す期限切れ failed の最大件数。
 * 期限切れは failed のまま残るため、運用者が対応するまで毎回（古い順の同じ先頭から）再ログされる。
 * 件数上限で復旧対象の取得や実行時間を圧迫しない。上限を超える分は expiredTruncated で示す。
 */
export const STRANDED_RECOVERY_EXPIRED_LOG_LIMIT = 20;

export async function recoverStrandedAccountDeletions(
  deps: Pick<AccountDeletionMutationDeps, "requests" | "scheduler">,
): Promise<{ recovered: number; expired: number }> {
  const cutoff = Date.now() - STRANDED_RECOVERY_MAX_AGE_MS;

  // 復旧対象（identityDeletedAt が期限内の failed）だけを index で直接読む。
  // identityDeletedAt 未設定の failed（本人が再試行できる行）は読まないので、件数が多くても対象を押し出さない。
  // index は identityDeletedAt 順なので、同じ古い行が失敗し続けても固定されないよう updatedAt 昇順で回す。
  const candidates = await deps.requests.listFailedIdentityDeletedAfter(
    cutoff,
    STRANDED_RECOVERY_CANDIDATE_CAP + 1,
  );
  if (candidates.length > STRANDED_RECOVERY_CANDIDATE_CAP) {
    console.error("Account deletion recovery saturated", {
      candidateCap: STRANDED_RECOVERY_CANDIDATE_CAP,
      batchSize: STRANDED_RECOVERY_BATCH_SIZE,
    });
  }
  const eligible = candidates
    .slice(0, STRANDED_RECOVERY_CANDIDATE_CAP)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, STRANDED_RECOVERY_BATCH_SIZE);
  let recovered = 0;
  for (const request of eligible) {
    await resumeFailedAccountDeletion(deps, request);
    recovered += 1;
  }

  // 期限切れは復旧せずログだけ残す。復旧対象の取得とは別クエリで、ログ件数も上限で抑える（+1 件で打ち切りを検知）。
  const expiredRows = await deps.requests.listFailedIdentityDeletedAtOrBefore(
    cutoff,
    STRANDED_RECOVERY_EXPIRED_LOG_LIMIT + 1,
  );
  const expiredTruncated = expiredRows.length > STRANDED_RECOVERY_EXPIRED_LOG_LIMIT;
  const expiredToLog = expiredRows.slice(0, STRANDED_RECOVERY_EXPIRED_LOG_LIMIT);
  for (const request of expiredToLog) {
    console.error("Account deletion recovery abandoned", {
      requestId: request.id,
      identityDeletedAt: request.identityDeletedAt,
      lastErrorCode: request.lastErrorCode,
      maxAgeDays: STRANDED_RECOVERY_MAX_AGE_MS / (24 * 60 * 60 * 1000),
      expiredLogged: expiredToLog.length,
      expiredTruncated,
    });
  }
  return { recovered, expired: expiredToLog.length };
}
