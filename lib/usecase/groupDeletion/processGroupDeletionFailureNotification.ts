/**
 * 削除失敗の最終通知処理（internalMutation）。
 * 既存 groupDeletionFailureNotification.processGroupDeletionFailureNotificationHandler の移植 —
 * owner 起点ジョブの依頼者へ失敗メールを1回だけ enqueue し、enqueue 失敗は指数バックオフで再試行する。
 */
import { FAILURE_NOTIFICATION_MAX_DELAY_MS } from "../../domain/groupDeletion/constants";
import type { GroupDeletionMutationDeps } from "./deps";

/** テストが差し替え可能な失敗メール enqueue（ドメイン形状）。 */
export type EnqueueFailureEmail = (args: {
  groupName: string;
  jobId: string;
  recipientEmail: string | undefined;
  businessDedupeKey: string;
}) => Promise<void>;

export async function processGroupDeletionFailureNotification(
  deps: Pick<GroupDeletionMutationDeps, "jobs" | "users" | "emailQueue" | "scheduler">,
  args: { jobId: string },
  enqueueFailureEmail?: EnqueueFailureEmail,
): Promise<null> {
  const job = await deps.jobs.get(args.jobId);
  if (
    job === null ||
    job.source !== "owner" ||
    !job.actorUserIdSnapshot ||
    job.failureNotificationHandledAt !== undefined
  ) {
    return null;
  }

  const requester = await deps.users.findByUserId(job.actorUserIdSnapshot);
  const attemptCount = (job.failureNotificationAttemptCount ?? 0) + 1;
  if (!requester?.email) {
    const now = Date.now();
    await deps.jobs.patch(job.id, {
      failureNotificationAttemptCount: attemptCount,
      failureNotificationHandledAt: now,
      updatedAt: now,
    });
    return null;
  }

  const enqueue =
    enqueueFailureEmail ??
    ((emailArgs) =>
      deps.emailQueue.deletionFailed({
        groupName: emailArgs.groupName,
        jobId: emailArgs.jobId,
        recipientEmail: emailArgs.recipientEmail,
        businessDedupeKey: emailArgs.businessDedupeKey,
      }));
  try {
    await enqueue({
      groupName: job.targetGroupNameSnapshot,
      jobId: job.id,
      recipientEmail: requester.email,
      businessDedupeKey: `${job.id}:failed:${job.actorUserIdSnapshot}`,
    });
    const now = Date.now();
    await deps.jobs.patch(job.id, {
      failureNotificationAttemptCount: attemptCount,
      failureNotificationHandledAt: now,
      updatedAt: now,
    });
  } catch {
    const delayMs = Math.min(
      60_000 * 2 ** Math.min(attemptCount - 1, 8),
      FAILURE_NOTIFICATION_MAX_DELAY_MS,
    );
    await deps.jobs.patch(job.id, {
      failureNotificationAttemptCount: attemptCount,
      updatedAt: Date.now(),
    });
    await deps.scheduler.scheduleFailureNotification(job.id, delayMs);
  }
  return null;
}
