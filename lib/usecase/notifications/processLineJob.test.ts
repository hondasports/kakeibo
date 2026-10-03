import { describe, expect, it, vi } from "vitest";
import type { LineNotificationJobRecord } from "../../domain/notifications/records";
import type { LinePushSendResult } from "../../domain/notifications/runner";
import { processLineNotificationJob } from "./processLineJob";

const RETRY_KEY = "550e8400-e29b-41d4-a716-446655440000";

function makeJob(overrides: Partial<LineNotificationJobRecord> = {}): LineNotificationJobRecord {
  return {
    id: "job-1",
    userId: "user-1",
    batchId: "batch-1",
    type: "ai_review_required",
    pendingCount: 2,
    linkId: "link-1",
    linkedAtSnapshot: 111,
    lineUserIdSnapshot: "line-user-1",
    text: "line text",
    status: "processing",
    attemptCount: 1,
    retryKey: RETRY_KEY,
    leaseUntil: 40_000,
    firstAttemptAt: 9_000,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeDeps({
  claimResult = { claimed: true as const, job: makeJob() },
  sendResult = { kind: "sent" as const, providerRequestId: "req-1" },
  now = () => 10_000,
}: {
  claimResult?: { claimed: true; job: LineNotificationJobRecord } | { claimed: false };
  sendResult?: LinePushSendResult;
  now?: () => number;
}) {
  const runner = {
    claimJob: vi.fn().mockResolvedValue(claimResult),
    completeJob: vi.fn().mockResolvedValue(undefined),
  };
  const sender = { send: vi.fn().mockResolvedValue(sendResult) };
  const deps = { runner, sender, now };
  return { deps, runner, sender };
}

describe("processLineNotificationJob", () => {
  it("does nothing when the job is not claimed", async () => {
    const { deps, sender, runner } = makeDeps({ claimResult: { claimed: false } });
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });
    expect(sender.send).not.toHaveBeenCalled();
    expect(runner.completeJob).not.toHaveBeenCalled();
  });

  it("sends the snapshot text/recipient with the persisted retryKey and marks sent", async () => {
    const { deps, sender, runner } = makeDeps({});
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });

    expect(sender.send).toHaveBeenCalledWith({
      to: "line-user-1",
      text: "line text",
      retryKey: RETRY_KEY,
    });
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        attemptCount: 1,
        completion: { outcome: "sent", providerRequestId: "req-1" },
      }),
    );
  });

  it("completes as retrying with the computed nextRetryAt on retryable provider failure", async () => {
    const { deps, runner } = makeDeps({
      sendResult: { kind: "retryable", errorCode: "provider_server_error" },
    });
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });

    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        attemptCount: 1,
        completion: {
          outcome: "retrying",
          nextRetryAt: 10_000 + 60_000,
          errorCode: "provider_server_error",
        },
      }),
    );
  });

  it("marks failed on permanent provider failure", async () => {
    const { deps, runner } = makeDeps({
      sendResult: { kind: "permanent", errorCode: "provider_rejected" },
    });
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });

    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { outcome: "failed", errorCode: "provider_rejected" },
      }),
    );
  });

  it("fails the job without sending when persisted retryKey is invalid", async () => {
    const { deps, sender, runner } = makeDeps({
      claimResult: { claimed: true, job: makeJob({ retryKey: "not-a-uuid" }) },
    });
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });
    expect(sender.send).not.toHaveBeenCalled();
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { outcome: "failed", errorCode: "invalid_retry_key" },
      }),
    );
  });

  it("terminates retries at the max attempt budget instead of scheduling", async () => {
    const { deps, runner } = makeDeps({
      claimResult: {
        claimed: true,
        job: makeJob({ attemptCount: 6, firstAttemptAt: 0 }),
      },
      sendResult: { kind: "retryable", errorCode: "provider_unavailable" },
    });
    await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { outcome: "failed", errorCode: "max_attempts_reached" },
      }),
    );
  });

  it("terminates retries that would land on or past the 24h retry-key TTL", async () => {
    const deadline = 24 * 60 * 60 * 1000;
    for (const now of [deadline - 2 * 60 * 60 * 1000, deadline - 2 * 60 * 60 * 1000 + 1]) {
      const { deps, runner } = makeDeps({
        claimResult: {
          claimed: true,
          job: makeJob({ attemptCount: 4, firstAttemptAt: 0 }),
        },
        sendResult: { kind: "retryable", errorCode: "provider_unavailable" },
        now: () => now,
      });
      await processLineNotificationJob(deps, { jobId: "job-1", retryKeyCandidate: RETRY_KEY });
      expect(runner.completeJob).toHaveBeenCalledWith(
        expect.objectContaining({
          completion: { outcome: "failed", errorCode: "retry_key_expired" },
        }),
      );
    }
  });

  it("fails without sending when the post-claim clock has passed the retry-key deadline", async () => {
    const deadline = 24 * 60 * 60 * 1000;
    let current = deadline - 1_000;
    const job = makeJob({ firstAttemptAt: 0 });
    const runner = {
      claimJob: vi.fn().mockImplementation(async () => {
        current = deadline + 2_000;
        return { claimed: true, job };
      }),
      completeJob: vi.fn().mockResolvedValue(undefined),
    };
    const sender = { send: vi.fn().mockResolvedValue({ kind: "sent" }) };

    await processLineNotificationJob(
      { runner, sender, now: () => current },
      { jobId: "job-1", retryKeyCandidate: RETRY_KEY },
    );

    expect(sender.send).not.toHaveBeenCalled();
    expect(runner.completeJob).toHaveBeenCalledWith({
      jobId: "job-1",
      attemptCount: job.attemptCount,
      completion: { outcome: "failed", errorCode: "retry_key_expired" },
      now: deadline + 2_000,
    });
  });

  it("fails without sending when the post-claim clock lands exactly on the deadline", async () => {
    const deadline = 24 * 60 * 60 * 1000;
    let current = deadline - 1;
    const job = makeJob({ firstAttemptAt: 0 });
    const runner = {
      claimJob: vi.fn().mockImplementation(async () => {
        current = deadline;
        return { claimed: true, job };
      }),
      completeJob: vi.fn().mockResolvedValue(undefined),
    };
    const sender = { send: vi.fn().mockResolvedValue({ kind: "sent" }) };

    await processLineNotificationJob(
      { runner, sender, now: () => current },
      { jobId: "job-1", retryKeyCandidate: RETRY_KEY },
    );

    expect(sender.send).not.toHaveBeenCalled();
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { outcome: "failed", errorCode: "retry_key_expired" },
      }),
    );
  });

  it("still sends when the post-claim clock is one ms before the deadline", async () => {
    const deadline = 24 * 60 * 60 * 1000;
    let current = deadline - 2;
    const job = makeJob({ firstAttemptAt: 0 });
    const runner = {
      claimJob: vi.fn().mockImplementation(async () => {
        current = deadline - 1;
        return { claimed: true, job };
      }),
      completeJob: vi.fn().mockResolvedValue(undefined),
    };
    const sender = {
      send: vi.fn().mockResolvedValue({ kind: "sent", providerRequestId: "req-9" }),
    };

    await processLineNotificationJob(
      { runner, sender, now: () => current },
      { jobId: "job-1", retryKeyCandidate: RETRY_KEY },
    );

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { outcome: "sent", providerRequestId: "req-9" },
      }),
    );
  });

  it("still sends on the 6th claim while within the retry-key TTL", async () => {
    const deadline = 24 * 60 * 60 * 1000;
    let current = deadline - 500;
    const job = makeJob({ attemptCount: 6, firstAttemptAt: 0 });
    const runner = {
      claimJob: vi.fn().mockImplementation(async () => {
        current = deadline - 1;
        return { claimed: true, job };
      }),
      completeJob: vi.fn().mockResolvedValue(undefined),
    };
    const sender = {
      send: vi.fn().mockResolvedValue({ kind: "sent", providerRequestId: "req-6" }),
    };

    await processLineNotificationJob(
      { runner, sender, now: () => current },
      { jobId: "job-1", retryKeyCandidate: RETRY_KEY },
    );

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(runner.completeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 6,
        completion: { outcome: "sent", providerRequestId: "req-6" },
      }),
    );
  });
});
