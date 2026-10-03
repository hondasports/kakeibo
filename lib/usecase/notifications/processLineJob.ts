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
  if (!job.retryKey || !isValidRetryKey(job.retryKey)) {
    await deps.runner.completeJob({
      jobId: args.jobId,
      attemptCount: job.attemptCount,
      completion: { outcome: "failed", errorCode: "invalid_retry_key" },
      now: now(),
    });
    return;
  }

  if (job.firstAttemptAt !== undefined && now() >= job.firstAttemptAt + LINE_RETRY_KEY_TTL_MS) {
    await deps.runner.completeJob({
      jobId: args.jobId,
      attemptCount: job.attemptCount,
      completion: { outcome: "failed", errorCode: "retry_key_expired" },
      now: now(),
    });
    return;
  }

  const result = await deps.sender.send({
    to: job.lineUserIdSnapshot,
    text: job.text,
    retryKey: job.retryKey,
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
      attemptCount: job.attemptCount,
      firstAttemptAt: job.firstAttemptAt ?? now(),
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
    attemptCount: job.attemptCount,
    completion,
    now: now(),
  });
}
