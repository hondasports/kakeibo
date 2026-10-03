import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import { isGroupDeleted } from "../../domain/groups/lifecycle";
import {
  AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  defaultNotificationEnabled,
  resolveNotificationDelivery,
} from "../../domain/notifications/model";
import {
  getLineNotificationExhaustionErrorCode,
  getLineNotificationSendAuthorizationErrorCode,
  isLineNotificationJobDue,
  LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  LINE_NOTIFICATION_STALE_JOB_MS,
} from "../../domain/notifications/rules";
import type { LineNotificationJobRecord } from "../../domain/notifications/records";
import type { LineNotificationClaimResult } from "../../domain/notifications/runner";
import type {
  LineNotificationClaimDeps,
  LineNotificationCompletionDeps,
  StaleLineNotificationRecoveryDeps,
} from "./deps";

export type ClaimLineNotificationJobArgs = {
  jobId: string;
  retryKeyCandidate: string;
  leaseMs: number;
  now: number;
};

async function evaluateSuppressionErrorCode(
  deps: LineNotificationClaimDeps,
  job: LineNotificationJobRecord,
): Promise<string | null> {
  const [lineSetting, user, batch] = await Promise.all([
    deps.settings.findByTypeAndChannel(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    deps.users.findByUserId(job.userId),
    deps.batches.getBatch(job.batchId),
  ]);

  if (!user) return "user_deleted";

  const deletionRequests = await deps.accountDeletionRequests.listByUser(job.userId, 25);
  if (deletionRequests.some((request) => isActiveAccountDeletionStatus(request.status))) {
    return "user_deleting";
  }

  const decision = resolveNotificationDelivery({
    type: AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
    channel: "line",
    globalEnabled:
      lineSetting?.enabled ??
      defaultNotificationEnabled(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    personalEnabled: user.notificationPreferences?.aiReviewRequiredLineEnabled,
  });
  if (!decision.enabled) return "notification_disabled";

  const activeLinks = await deps.links.listActiveByUserId(job.userId);
  if (activeLinks.length === 0) return "user_unlinked";
  if (activeLinks.length !== 1) return "link_changed";
  const link = activeLinks[0];
  if (
    link.id !== job.linkId ||
    link.linkedAt !== job.linkedAtSnapshot ||
    link.lineUserId !== job.lineUserIdSnapshot
  ) {
    return "link_changed";
  }

  if (!batch || batch.createdByUserId !== job.userId) return "batch_deleted";
  const [group, membership] = await Promise.all([
    deps.groups.get(batch.groupId),
    deps.memberships.findByGroupAndUser(batch.groupId, job.userId),
  ]);
  if (!group || isGroupDeleted(group)) return "group_deleted";
  if (!membership) return "membership_missing";

  return null;
}

export async function claimLineNotificationJob(
  deps: LineNotificationClaimDeps,
  args: ClaimLineNotificationJobArgs,
): Promise<LineNotificationClaimResult> {
  const job = await deps.jobs.getJob(args.jobId);
  if (!job || !isLineNotificationJobDue(job, args.now)) {
    return { claimed: false };
  }

  const exhaustionErrorCode = getLineNotificationExhaustionErrorCode(job, args.now);
  if (exhaustionErrorCode !== null) {
    await deps.jobs.patch(args.jobId, {
      status: "failed",
      errorCode: exhaustionErrorCode,
      leaseUntil: undefined,
      nextRetryAt: undefined,
      updatedAt: args.now,
    });
    return { claimed: false };
  }

  const suppressionErrorCode = await evaluateSuppressionErrorCode(deps, job);
  if (suppressionErrorCode !== null) {
    await deps.jobs.patch(args.jobId, {
      status: "suppressed",
      errorCode: suppressionErrorCode,
      leaseUntil: undefined,
      nextRetryAt: undefined,
      updatedAt: args.now,
    });
    return { claimed: false };
  }

  const attemptCount = job.attemptCount + 1;
  const leaseUntil = args.now + args.leaseMs;
  const firstAttemptAt = job.firstAttemptAt ?? args.now;
  const retryKey = job.retryKey ?? args.retryKeyCandidate;

  await deps.jobs.patch(args.jobId, {
    status: "processing",
    attemptCount,
    retryKey,
    leaseUntil,
    firstAttemptAt,
    nextRetryAt: undefined,
    errorCode: undefined,
    updatedAt: args.now,
  });
  await deps.scheduler.scheduleLeaseRecovery(args.jobId, attemptCount, leaseUntil);

  return {
    claimed: true,
    job: {
      ...job,
      status: "processing",
      attemptCount,
      retryKey,
      leaseUntil,
      firstAttemptAt,
      updatedAt: args.now,
    },
  };
}

export async function authorizeLineNotificationSend(
  deps: LineNotificationClaimDeps,
  args: {
    jobId: string;
    attemptCount: number;
    retryKey: string;
    leaseMs: number;
    now: number;
  },
): Promise<LineNotificationClaimResult> {
  const job = await deps.jobs.getJob(args.jobId);
  if (
    !job ||
    job.status !== "processing" ||
    job.attemptCount !== args.attemptCount ||
    job.retryKey !== args.retryKey ||
    job.leaseUntil === undefined ||
    job.leaseUntil <= args.now
  ) {
    return { claimed: false };
  }

  const sendAuthorizationErrorCode = getLineNotificationSendAuthorizationErrorCode(job, args.now);
  if (sendAuthorizationErrorCode !== null) {
    await deps.jobs.patch(args.jobId, {
      status: "failed",
      errorCode: sendAuthorizationErrorCode,
      leaseUntil: undefined,
      nextRetryAt: undefined,
      updatedAt: args.now,
    });
    return { claimed: false };
  }

  const suppressionErrorCode = await evaluateSuppressionErrorCode(deps, job);
  if (suppressionErrorCode !== null) {
    await deps.jobs.patch(args.jobId, {
      status: "suppressed",
      errorCode: suppressionErrorCode,
      leaseUntil: undefined,
      nextRetryAt: undefined,
      updatedAt: args.now,
    });
    return { claimed: false };
  }

  const leaseUntil = args.now + args.leaseMs;
  await deps.jobs.patch(args.jobId, {
    leaseUntil,
    updatedAt: args.now,
  });
  await deps.scheduler.scheduleLeaseRecovery(args.jobId, args.attemptCount, leaseUntil);

  return {
    claimed: true,
    job: {
      ...job,
      leaseUntil,
      updatedAt: args.now,
    },
  };
}

export async function completeLineNotificationJob(
  deps: LineNotificationCompletionDeps,
  args: {
    jobId: string;
    attemptCount: number;
    completion:
      | { outcome: "sent"; providerRequestId?: string }
      | { outcome: "retrying"; nextRetryAt: number; errorCode?: string }
      | { outcome: "failed"; errorCode?: string }
      | { outcome: "suppressed"; errorCode?: string };
  },
): Promise<void> {
  const now = (deps.now ?? Date.now)();
  const job = await deps.jobs.getJob(args.jobId);
  if (!job) return;
  if (job.status !== "processing" || job.attemptCount !== args.attemptCount) return;

  const completion = args.completion;
  if (completion.outcome === "sent") {
    await deps.jobs.patch(args.jobId, {
      status: "sent",
      ...(completion.providerRequestId === undefined
        ? {}
        : { providerRequestId: completion.providerRequestId }),
      leaseUntil: undefined,
      nextRetryAt: undefined,
      errorCode: undefined,
      updatedAt: now,
    });
    return;
  }
  if (completion.outcome === "retrying") {
    await deps.jobs.patch(args.jobId, {
      status: "retrying",
      nextRetryAt: completion.nextRetryAt,
      errorCode: completion.errorCode,
      leaseUntil: undefined,
      updatedAt: now,
    });
    await deps.scheduler.scheduleProcessJob(Math.max(0, completion.nextRetryAt - now), args.jobId);
    return;
  }
  await deps.jobs.patch(args.jobId, {
    status: completion.outcome,
    errorCode: completion.errorCode,
    leaseUntil: undefined,
    nextRetryAt: undefined,
    updatedAt: now,
  });
}

export async function recoverLineNotificationLease(
  deps: StaleLineNotificationRecoveryDeps,
  args: { jobId: string; attemptCount: number },
  now: number,
): Promise<void> {
  const job = await deps.jobs.getJob(args.jobId);
  if (!job || job.status !== "processing" || job.attemptCount !== args.attemptCount) return;
  if (job.leaseUntil !== undefined && job.leaseUntil > now) return;

  const exhaustionErrorCode = getLineNotificationExhaustionErrorCode(job, now);
  if (exhaustionErrorCode !== null) {
    await deps.jobs.patch(args.jobId, {
      status: "failed",
      errorCode: exhaustionErrorCode,
      leaseUntil: undefined,
      nextRetryAt: undefined,
      updatedAt: now,
    });
    return;
  }

  await deps.jobs.patch(args.jobId, {
    status: "retrying",
    nextRetryAt: now,
    leaseUntil: undefined,
    updatedAt: now,
  });
  await deps.scheduler.scheduleProcessJob(0, args.jobId);
}

export async function recoverStaleLineNotificationJobs(
  deps: StaleLineNotificationRecoveryDeps,
): Promise<void> {
  const now = (deps.now ?? Date.now)();
  const staleBefore = now - LINE_NOTIFICATION_STALE_JOB_MS;

  const staleQueuedJobs = await deps.jobs.listJobsByStatusUpdatedBefore(
    "queued",
    staleBefore,
    LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  );
  for (const job of staleQueuedJobs) {
    await deps.jobs.patch(job.id, { updatedAt: now });
    await deps.scheduler.scheduleProcessJob(0, job.id);
  }

  const dueRetryingJobs = await deps.jobs.listDueRetryingJobs(
    now,
    LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  );
  for (const job of dueRetryingJobs) {
    await deps.jobs.patch(job.id, { updatedAt: now });
    await deps.scheduler.scheduleProcessJob(0, job.id);
  }

  const expiredProcessingJobs = await deps.jobs.listExpiredProcessingJobs(
    now,
    LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  );
  for (const job of expiredProcessingJobs) {
    await recoverLineNotificationLease(
      deps,
      { jobId: job.id, attemptCount: job.attemptCount },
      now,
    );
  }
}
