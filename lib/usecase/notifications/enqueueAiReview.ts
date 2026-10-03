import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import {
  AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  defaultNotificationEnabled,
  resolveNotificationDelivery,
} from "../../domain/notifications/model";
import {
  buildAiReviewEmailDedupeKey,
  buildAiReviewLineText,
} from "../../domain/notifications/rules";
import { enqueueTransactionalEmailJob } from "../email/enqueueJob";
import type { AiReviewNotificationEnqueueDeps } from "./deps";

export type EnqueueAiReviewNotificationsArgs = {
  batchId: string;
  userId: string;
  pendingCount: number;
};

export async function enqueueAiReviewNotifications(
  deps: AiReviewNotificationEnqueueDeps,
  args: EnqueueAiReviewNotificationsArgs,
): Promise<void> {
  if (!Number.isInteger(args.pendingCount) || args.pendingCount < 1) return;

  const batch = await deps.batches.getBatch(args.batchId);
  if (!batch?.createdByUserId || batch.createdByUserId !== args.userId) return;

  const now = (deps.now ?? Date.now)();

  const [group, membership, user] = await Promise.all([
    deps.groups.get(batch.groupId),
    deps.memberships.findByGroupAndUser(batch.groupId, batch.createdByUserId),
    deps.users.findByUserId(batch.createdByUserId),
  ]);
  if (!group || isGroupDeleted(group)) return;
  if (!membership || !user) return;

  const deletionRequests = await deps.accountDeletionRequests.listByUser(batch.createdByUserId, 25);
  if (deletionRequests.some((request) => isActiveAccountDeletionStatus(request.status))) {
    return;
  }

  if (user.email) {
    await enqueueTransactionalEmailJob(
      { jobs: deps.emailJobs, scheduler: deps.emailScheduler, now: () => now },
      {
        templateType: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
        payloadJson: JSON.stringify({ pendingCount: args.pendingCount }),
        recipientEmail: user.email,
        recipientUserId: user.userId,
        businessDedupeKey: buildAiReviewEmailDedupeKey(args.batchId),
      },
    );
  }

  const [lineSetting, activeLinks, existingLineJob] = await Promise.all([
    deps.settings.findByTypeAndChannel(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    deps.links.listActiveByUserId(batch.createdByUserId),
    deps.lineJobs.findByBatchId(args.batchId),
  ]);

  const lineDecision = resolveNotificationDelivery({
    type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
    channel: "line",
    globalEnabled:
      lineSetting?.enabled ??
      defaultNotificationEnabled(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    personalEnabled: user.notificationPreferences?.aiReviewRequiredLineEnabled,
  });
  if (!lineDecision.enabled || activeLinks.length !== 1 || existingLineJob) return;

  const link = activeLinks[0];
  const lineJobId = await deps.lineJobs.insert({
    userId: batch.createdByUserId,
    batchId: args.batchId,
    type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
    pendingCount: args.pendingCount,
    linkId: link.id,
    linkedAtSnapshot: link.linkedAt,
    lineUserIdSnapshot: link.lineUserId,
    text: buildAiReviewLineText(args.pendingCount),
    status: "queued",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await deps.lineScheduler.scheduleProcessJob(0, lineJobId);
}
