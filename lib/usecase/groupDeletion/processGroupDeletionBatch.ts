/**
 * グループ削除バッチ処理のオーケストレータ（internalMutation）。
 * 既存 groupDeletionBatchProcessor.processGroupDeletionBatchHandler の移植 —
 * ステージごとの処理をディスパッチし、失敗時は部分進捗を保存してリトライ記録へ委譲する。
 */
import { BATCH_SIZE } from "../../domain/groupDeletion/constants";
import {
  accumulateDeletedCounts,
  incrementGroupDeletedCount,
} from "../../domain/groupDeletion/counts";
import { decideBatchEntry } from "../../domain/groupDeletion/jobTransitions";
import {
  isPurgeStage,
  nextDeletionStage,
  usesRecipientNotifications,
  GROUP_DELETION_PURGE_STAGES,
} from "../../domain/groupDeletion/stages";
import type { PurgeStage } from "../../domain/groupDeletion/stages";
import type { GroupDeletionMutationDeps } from "./deps";
import { processRecipientNotificationBatch } from "./processRecipientNotificationBatch";
import { recordBatchRetry } from "./recordBatchRetry";
import { runPurgeStage, type StageProgress } from "./runPurgeStage";

type Deps = Pick<
  GroupDeletionMutationDeps,
  "jobs" | "purge" | "recipients" | "scheduler" | "users" | "emailQueue" | "groups"
>;

export async function processGroupDeletionBatch(
  deps: Deps,
  args: { jobId: string },
): Promise<null> {
  const job = await deps.jobs.get(args.jobId);
  if (job === null) {
    return null;
  }
  const now = Date.now();
  const entry = decideBatchEntry(job, now);
  if (entry.kind === "skip") {
    return null;
  }
  if (entry.kind === "reschedule") {
    await deps.scheduler.scheduleBatch(job.id, entry.delayMs);
    return null;
  }

  const progress: StageProgress = { deleted: 0, storageFiles: 0 };
  let groupDeleted = false;
  try {
    const groupId = deps.jobs.resolveGroupId(job.targetGroupIdSnapshot);
    if (groupId === null) {
      const completedAt = Date.now();
      await deps.jobs.patch(job.id, {
        status: "completed",
        stage: "finalSweep",
        isActive: false,
        nextRetryAt: undefined,
        updatedAt: completedAt,
        completedAt,
      });
      return null;
    }

    await deps.jobs.patch(job.id, {
      status: "running",
      nextRetryAt: undefined,
      updatedAt: Date.now(),
    });

    if (job.stage === "recipientSnapshot") {
      const page = await deps.recipients.paginateGroupMembers(
        groupId,
        job.snapshotCursor ?? null,
        BATCH_SIZE,
      );
      const now = Date.now();
      for (const member of page.page) {
        const existing = await deps.recipients.findRecipient(job.id, member.userId);
        if (existing === null) {
          await deps.recipients.insertRecipient({
            jobId: job.id,
            recipientUserId: member.userId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      await deps.jobs.patch(job.id, {
        stage: page.isDone ? "startedEnqueue" : "recipientSnapshot",
        snapshotCursor: page.isDone ? undefined : page.continueCursor,
        updatedAt: now,
      });
      await deps.scheduler.scheduleBatch(job.id);
      return null;
    }

    if (job.stage === "startedEnqueue" || job.stage === "completedEnqueue") {
      await processRecipientNotificationBatch(
        deps,
        job,
        job.stage === "startedEnqueue" ? "started" : "completed",
      );
      return null;
    }

    if (job.stage === "recipientCleanup") {
      const recipients = await deps.recipients.takeRecipients(job.id, BATCH_SIZE);
      if (recipients.length > 0) {
        for (const recipient of recipients) {
          await deps.recipients.deleteRecipient(recipient.id);
        }
        await deps.scheduler.scheduleBatch(job.id);
        return null;
      }
      const now = Date.now();
      await deps.jobs.patch(job.id, {
        status: "completed",
        isActive: false,
        nextRetryAt: undefined,
        updatedAt: now,
        completedAt: now,
      });
      return null;
    }

    if (job.stage === "finalSweep") {
      let remainingStage: PurgeStage | null = null;
      for (const stage of GROUP_DELETION_PURGE_STAGES) {
        if (await deps.purge.hasStageDocuments(stage, groupId)) {
          remainingStage = stage;
          break;
        }
      }
      if (remainingStage !== null) {
        await deps.jobs.patch(job.id, {
          stage: remainingStage,
          updatedAt: Date.now(),
        });
        await deps.scheduler.scheduleBatch(job.id);
        return null;
      }

      const group = await deps.groups.get(groupId);
      let deletedCounts = job.deletedCounts;
      if (group !== null) {
        await deps.purge.deleteGroup(groupId);
        deletedCounts = incrementGroupDeletedCount(deletedCounts);
        groupDeleted = true;
      }
      const now = Date.now();
      const notify = usesRecipientNotifications(job.source, job.actorUserIdSnapshot);
      await deps.jobs.patch(job.id, {
        status: notify ? "running" : "completed",
        stage: notify ? "completedEnqueue" : "finalSweep",
        isActive: notify,
        nextRetryAt: undefined,
        deletedCounts,
        updatedAt: now,
        completedAt: notify ? undefined : now,
      });
      if (notify) {
        await deps.scheduler.scheduleBatch(job.id);
      }
      return null;
    }

    await runPurgeStage(deps, job.stage, groupId, progress);
    const deletedCounts = accumulateDeletedCounts(job.deletedCounts, job.stage, progress);
    const stage = progress.deleted === 0 ? nextDeletionStage(job.stage) : job.stage;
    await deps.jobs.patch(job.id, {
      stage,
      deletedCounts,
      updatedAt: Date.now(),
    });
    await deps.scheduler.scheduleBatch(job.id);
  } catch {
    if (isPurgeStage(job.stage) && (progress.deleted > 0 || progress.storageFiles > 0)) {
      await deps.jobs.patch(job.id, {
        deletedCounts: accumulateDeletedCounts(job.deletedCounts, job.stage, progress),
        updatedAt: Date.now(),
      });
    } else if (groupDeleted) {
      await deps.jobs.patch(job.id, {
        deletedCounts: incrementGroupDeletedCount(job.deletedCounts),
        updatedAt: Date.now(),
      });
    }
    const latestJob = (await deps.jobs.get(job.id)) ?? job;
    await recordBatchRetry(deps, latestJob);
  }

  return null;
}
