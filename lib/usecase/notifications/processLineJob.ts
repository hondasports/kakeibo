import type { LineNotificationCompletion } from "../../domain/notifications/runner";
import {
  LINE_NOTIFICATION_LEASE_MS,
  LINE_RETRY_KEY_TTL_MS,
  isValidRetryKey,
  planLineNotificationRetry,
} from "../../domain/notifications/rules";
import type { ProcessLineNotificationJobDeps } from "./deps";

export async function processLineNotificationJob(
  deps: ProcessLineNotificationJobDeps,
  args: { jobId: string; retryKeyCandidate: string },
): Promise<void> {
  const now = deps.now ?? Date.now;

  const claim = await deps.runner.claimJob({
    jobId: args.jobId,
    retryKeyCandidate: args.retryKeyCandidate,
    leaseMs: LINE_NOTIFICATION_LEASE_MS,
    now: now(),
  });
  if (!claim.claimed) return;

  const job = claim.job;
  const retryKey = job.retryKey;
  if (!retryKey || !isValidRetryKey(retryKey)) {
    await deps.runner.completeJob({
      jobId: args.jobId,
      attemptCount: job.attemptCount,
      completion: { outcome: "failed", errorCode: "invalid_retry_key" },
      now: now(),
    });
    return;
  }

  const sendAuthorization = await deps.runner.authorizeSend({
    jobId: args.jobId,
    attemptCount: job.attemptCount,
    retryKey,
    leaseMs: LINE_NOTIFICATION_LEASE_MS,
    now: now(),
  });
  if (!sendAuthorization.claimed) return;

  const sendJob = sendAuthorization.job;
  if (sendJob.leaseUntil === undefined || now() >= sendJob.leaseUntil) {
    return;
  }
  if (
    sendJob.firstAttemptAt !== undefined &&
    now() >= sendJob.firstAttemptAt + LINE_RETRY_KEY_TTL_MS
  ) {
    await deps.runner.completeJob({
      jobId: args.jobId,
      attemptCount: sendJob.attemptCount,
      completion: { outcome: "failed", errorCode: "retry_key_expired" },
      now: now(),
    });
    return;
  }

  const result = await deps.sender.send({
    to: sendJob.lineUserIdSnapshot,
    text: sendJob.text,
    retryKey,
  });

  let completion: LineNotificationCompletion;

  if (result.kind === "sent") {
    completion = {
      outcome: "sent",
      ...(result.providerRequestId === undefined
        ? {}
        : { providerRequestId: result.providerRequestId }),
    };
  } else if (result.kind === "permanent") {
    completion = { outcome: "failed", errorCode: result.errorCode };
  } else {
    const plan = planLineNotificationRetry({
      attemptCount: sendJob.attemptCount,
      firstAttemptAt: sendJob.firstAttemptAt ?? now(),
      now: now(),
    });
    if (plan.kind === "retry") {
      completion = {
        outcome: "retrying",
        nextRetryAt: plan.nextRetryAt,
        errorCode: result.errorCode,
      };
    } else {
      completion = { outcome: "failed", errorCode: plan.errorCode };
    }
  }

  await deps.runner.completeJob({
    jobId: args.jobId,
    attemptCount: sendJob.attemptCount,
    completion,
    now: now(),
  });
}
