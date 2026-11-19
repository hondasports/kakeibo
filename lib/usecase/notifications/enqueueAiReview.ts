import { resolveActiveLink } from "../../domain/lineLink/activeLink";
import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import {
  AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  defaultNotificationEnabled,
  resolveNotificationDelivery,
} from "../../domain/notifications/model";
import {
  buildAiReviewEmailDedupeKey,
  buildAiReviewLineDedupeKey,
  buildAiReviewLineText,
} from "../../domain/notifications/rules";
import { MAX_RECEIPT_ANALYSIS_BATCH_FILES } from "../../domain/receiptAnalysisJobs/rules";
import { enqueueTransactionalEmailJob } from "../email/enqueueJob";
import type { AiReviewNotificationEnqueueDeps } from "./deps";

export type EnqueueAiReviewNotificationsArgs = {
  batchId: string;
  userId: string;
};

export async function enqueueAiReviewNotifications(
  deps: AiReviewNotificationEnqueueDeps,
  args: EnqueueAiReviewNotificationsArgs,
): Promise<void> {
  const batch = await deps.batches.getBatch(args.batchId);
  if (!batch?.createdByUserId || batch.createdByUserId !== args.userId) return;

  // 件数は通知を積むのと同じ transaction の中で、下書きの今の状態から数える。
  // 0件ならメールも LINE も積まず、LINE の重複防止（aiReviewLineNotificationConsumedAt）も立てない。
  const pendingCount = await deps.batches.countNeedsReviewDraftsByBatch(
    args.batchId,
    MAX_RECEIPT_ANALYSIS_BATCH_FILES,
  );
  if (pendingCount < 1) return;

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
        payloadJson: JSON.stringify({ pendingCount: pendingCount }),
        recipientEmail: user.email,
        recipientUserId: user.userId,
        businessDedupeKey: buildAiReviewEmailDedupeKey(args.batchId),
      },
    );
  }

  if (batch.aiReviewLineNotificationConsumedAt !== undefined) return;

  const lineDedupeKey = buildAiReviewLineDedupeKey(args.batchId);
  const [lineSetting, activeLinks, existingLineJob, existingLineEvent] = await Promise.all([
    deps.settings.findByTypeAndChannel(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    deps.links.listActiveByUserId(batch.createdByUserId),
    deps.lineJobs.findByBatchId(args.batchId),
    deps.lineEvents.findByDedupeKey(lineDedupeKey),
  ]);

  const lineDecision = resolveNotificationDelivery({
    type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
    channel: "line",
    globalEnabled:
      lineSetting?.enabled ??
      defaultNotificationEnabled(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    personalEnabled: user.notificationPreferences?.aiReviewRequiredLineEnabled,
  });

  const activeLink = resolveActiveLink(activeLinks);
  let outcome: "queued" | "skipped" = "queued";
  let skipReason: string | undefined;
  if (existingLineJob) outcome = "queued";
  else if (!lineDecision.enabled) {
    outcome = "skipped";
    skipReason = "notification_disabled";
  } else if (activeLink.kind === "none") {
    outcome = "skipped";
    skipReason = "user_unlinked";
  } else if (activeLink.kind === "multiple") {
    outcome = "skipped";
    skipReason = "link_ambiguous";
  }

  if (!existingLineEvent) {
    await deps.lineEvents.insert({
      userId: batch.createdByUserId,
      batchId: args.batchId,
      type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
      dedupeKey: lineDedupeKey,
      outcome,
      reason: skipReason,
      createdAt: now,
      updatedAt: now,
    });
  }
  await deps.batches.patchBatch(args.batchId, {
    aiReviewLineNotificationConsumedAt: now,
  });
  if (existingLineEvent || existingLineJob || outcome === "skipped" || activeLink.kind !== "single")
    return;

  const link = activeLink.link;
  const lineJobId = await deps.lineJobs.insert({
    userId: batch.createdByUserId,
    batchId: args.batchId,
    type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
    pendingCount: pendingCount,
    linkId: link.id,
    linkedAtSnapshot: link.linkedAt,
    lineUserIdSnapshot: link.lineUserId,
    text: buildAiReviewLineText(pendingCount),
    status: "queued",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await deps.lineScheduler.scheduleProcessJob(0, lineJobId);
}
