/**
 * グループ purge 連携の進捗確認（internalMutation）。
 * pending/running 関連を子ジョブの状態へ同期し、全完了なら requested へ、
 * 未完了なら60秒後に再スケジュール、失敗があれば failed へ遷移させる。
 */
import type { AccountDeletionMutationDeps } from "./deps";

const GROUP_BATCH_SIZE = 25;
const PURGE_POLL_DELAY_MS = 60_000;

export type AdvancePurgeResult = "waiting" | "ready" | "failed";

export async function advanceAccountDeletionPurge(
  deps: Pick<
    AccountDeletionMutationDeps,
    "requests" | "purges" | "groupDeletionJobs" | "scheduler"
  >,
  args: { requestId: string },
): Promise<AdvancePurgeResult> {
  const request = await deps.requests.get(args.requestId);
  if (!request || request.status === "completed") return "ready";
  if (request.status === "failed") return "failed";
  if (request.status === "preparing_groups" && !request.preparationCompletedAt) {
    await deps.scheduler.schedulePrepareBatch(args.requestId);
    return "waiting";
  }
  const pendingRelations = await deps.purges.takeByRequestAndStatus(
    args.requestId,
    "pending",
    GROUP_BATCH_SIZE,
  );
  const runningRelations = await deps.purges.takeByRequestAndStatus(
    args.requestId,
    "running",
    GROUP_BATCH_SIZE,
  );
  const relations = [...pendingRelations, ...runningRelations].slice(0, GROUP_BATCH_SIZE);
  for (const relation of relations) {
    const job = await deps.groupDeletionJobs.get(relation.groupDeletionJobId);
    if (!job) {
      await deps.purges.patch(relation.id, {
        status: "failed",
        lastErrorCode: "group_purge_job_missing",
        lastErrorMessage: "グループ削除ジョブが見つかりません。",
        updatedAt: Date.now(),
      });
      await deps.requests.patch(args.requestId, {
        status: "failed",
        lastErrorCode: "group_purge_job_missing",
        lastErrorMessage: "グループ削除ジョブが見つかりません。",
        updatedAt: Date.now(),
      });
      return "failed";
    }
    if (job.status === "failed") {
      await deps.purges.patch(relation.id, {
        status: "failed",
        lastErrorCode: job.lastErrorCategory ?? "group_purge_failed",
        lastErrorMessage: "グループデータの削除に失敗しました。",
        updatedAt: Date.now(),
      });
      await deps.requests.patch(args.requestId, {
        status: "failed",
        lastErrorCode: job.lastErrorCategory ?? "group_purge_failed",
        lastErrorMessage: "グループデータの削除に失敗しました。",
        updatedAt: Date.now(),
      });
      return "failed";
    }
    if (job.status === "completed") {
      await deps.purges.patch(relation.id, {
        status: "completed",
        completedAt: job.completedAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else if (relation.status === "pending") {
      await deps.purges.patch(relation.id, { status: "running", updatedAt: Date.now() });
    }
  }
  const pending = await deps.purges.takeByRequestAndStatus(args.requestId, "pending", 1);
  const failed = await deps.purges.takeByRequestAndStatus(args.requestId, "failed", 1);
  if (failed.length > 0) {
    await deps.requests.patch(args.requestId, {
      status: "failed",
      lastErrorCode: failed[0].lastErrorCode ?? "group_purge_failed",
      lastErrorMessage: failed[0].lastErrorMessage ?? "グループデータの削除に失敗しました。",
      updatedAt: Date.now(),
    });
    return "failed";
  }
  const running = await deps.purges.takeByRequestAndStatus(args.requestId, "running", 1);
  if (pending.length > 0 || running.length > 0) {
    await deps.scheduler.scheduleProcess(args.requestId, PURGE_POLL_DELAY_MS);
    return "waiting";
  }
  await deps.requests.patch(args.requestId, { status: "requested", updatedAt: Date.now() });
  return "ready";
}
