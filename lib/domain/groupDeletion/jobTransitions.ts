/**
 * 削除ジョブの遷移判定（純粋ドメイン関数）。
 * バッチ開始時の扱いと、resume 可否の判定をドメイン知識として保持する。
 */
import type { GroupDeletionJobRecord, GroupDeletionJobStatus } from "./groupDeletionJob";
import { canRunAfterGroupDeletion, isTerminalJobStatus } from "./stages";

export type BatchEntryDecision =
  | { kind: "skip" }
  | { kind: "reschedule"; delayMs: number }
  | { kind: "proceed" };

/**
 * バッチ開始時の扱いを決める。
 * - 終端ステータス（completed/failed）→ skip
 * - retry_wait かつ nextRetryAt が未来 → 残り時間で再スケジュール
 * - それ以外 → 処理続行
 */
export function decideBatchEntry(
  job: Pick<GroupDeletionJobRecord, "status" | "nextRetryAt">,
  now: number,
): BatchEntryDecision {
  if (isTerminalJobStatus(job.status)) {
    return { kind: "skip" };
  }
  if (job.status === "retry_wait" && job.nextRetryAt !== undefined && job.nextRetryAt > now) {
    return { kind: "reschedule", delayMs: job.nextRetryAt - now };
  }
  return { kind: "proceed" };
}

export type ResumeEligibility =
  | { kind: "not_failed" }
  | { kind: "group_state_invalid" }
  | { kind: "already_active" }
  | { kind: "allowed" };

/**
 * resume 可否を判定する（並列アクティブジョブの有無は呼び出し側が与える）。
 * - ジョブが failed でない → not_failed
 * - グループ不在かつ post-deletion ステージでない、またはグループが deleting でない → group_state_invalid
 * - 同じ対象のアクティブジョブが存在 → already_active
 */
export function evaluateResumeEligibility(
  job: Pick<GroupDeletionJobRecord, "status" | "stage">,
  args: {
    /** グループドキュメントが存在しないか。 */
    groupMissing: boolean;
    /** グループの status（存在時）。 */
    groupStatus?: string;
    hasActiveJobForTarget: boolean;
  },
): ResumeEligibility {
  if (job.status !== "failed") {
    return { kind: "not_failed" };
  }
  if (
    (args.groupMissing && !canRunAfterGroupDeletion(job.stage)) ||
    (!args.groupMissing && args.groupStatus !== "deleting")
  ) {
    return { kind: "group_state_invalid" };
  }
  if (args.hasActiveJobForTarget) {
    return { kind: "already_active" };
  }
  return { kind: "allowed" };
}

/** resume 時にジョブへ適用するリセット patch を返す。 */
export function resumeResetPatch(now: number): Partial<{
  status: GroupDeletionJobStatus;
  isActive: boolean;
  attemptCount: number;
  nextRetryAt: undefined;
  lastErrorCategory: undefined;
  completedAt: undefined;
  updatedAt: number;
}> {
  return {
    status: "requested",
    isActive: true,
    attemptCount: 0,
    nextRetryAt: undefined,
    lastErrorCategory: undefined,
    completedAt: undefined,
    updatedAt: now,
  };
}
