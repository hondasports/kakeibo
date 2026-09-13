/**
 * 受信者通知の1バッチ処理（内部ステップ）。
 * 既存 groupDeletionRecipientNotifications.processRecipientNotificationBatch の移植 —
 * 未処理受信者へ started/completed メールを enqueue し、全件処理済みなら次ステージへ進める。
 */
import { BATCH_SIZE } from "../../domain/groupDeletion/constants";
import { GROUP_DELETION_PURGE_STAGES } from "../../domain/groupDeletion/stages";
import type { GroupDeletionJobRecord } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionNotificationEvent } from "../../domain/groupDeletion/groupDeletionRecipientStore";
import type { GroupDeletionMutationDeps } from "./deps";

export async function processRecipientNotificationBatch(
  deps: Pick<
    GroupDeletionMutationDeps,
    "jobs" | "recipients" | "users" | "emailQueue" | "scheduler"
  >,
  job: GroupDeletionJobRecord,
  event: GroupDeletionNotificationEvent,
): Promise<void> {
  const recipients = await deps.recipients.listUnnotified(job.id, event, BATCH_SIZE);

  if (recipients.length === 0) {
    await deps.jobs.patch(job.id, {
      stage: event === "started" ? GROUP_DELETION_PURGE_STAGES[0] : "recipientCleanup",
      updatedAt: Date.now(),
    });
    await deps.scheduler.scheduleBatch(job.id);
    return;
  }

  const now = Date.now();
  for (const recipient of recipients) {
    const user = await deps.users.findByUserId(recipient.recipientUserId);
    const businessDedupeKey = `${job.id}:${event}:${recipient.recipientUserId}`;
    if (event === "started") {
      await deps.emailQueue.deletionStarted({
        groupName: job.targetGroupNameSnapshot,
        recipientEmail: user?.email,
        businessDedupeKey,
      });
    } else {
      await deps.emailQueue.groupDeleted({
        groupName: job.targetGroupNameSnapshot,
        recipientEmail: user?.email,
        businessDedupeKey,
      });
    }
    await deps.recipients.markHandled(recipient.id, event, now);
  }
  await deps.scheduler.scheduleBatch(job.id);
}
