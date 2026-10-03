import { describe, expect, it, vi } from "vitest";
import type { EmailJobActionRunner } from "../../domain/email/runner";
import { EmailProviderError } from "../../email/model";
import { processEmailJob } from "./processJob";

function createDeps({
  job,
  suppression = null,
  deliveryDecision = { enabled: true },
  sendResult = { ok: true as const, providerMessageId: "msg-1" },
  now = () => 5000,
}: {
  job: Record<string, unknown> | null;
  suppression?: Record<string, unknown> | null;
  deliveryDecision?: { enabled: boolean; reason?: string };
  sendResult?: { ok: true; providerMessageId: string } | { ok: false; error: EmailProviderError };
  now?: () => number;
}) {
  const runner: EmailJobActionRunner = {
    getJob: vi.fn().mockResolvedValue(job),
    findSuppression: vi.fn().mockResolvedValue(suppression),
    getNotificationDeliveryDecision: vi.fn().mockResolvedValue(deliveryDecision),
    markJobSent: vi.fn().mockResolvedValue(undefined),
    markJobRetrying: vi.fn().mockResolvedValue(undefined),
    markJobTerminal: vi.fn().mockResolvedValue(undefined),
  };
  const sender = { send: vi.fn().mockResolvedValue(sendResult) };
  const scheduler = {
    scheduleProcessJob: vi.fn().mockResolvedValue(undefined),
    scheduleCleanup: vi.fn().mockResolvedValue(undefined),
  };
  return { runner, sender, scheduler, now };
}

const queuedJob = {
  id: "job-1",
  status: "queued",
  normalizedRecipientEmail: "test@example.com",
  recipientEmail: "test@example.com",
  templateType: "email_delivery_test",
  payloadJson: JSON.stringify({ to: "test@example.com" }),
  attemptCount: 0,
};

describe("processEmailJob", () => {
  it("marks the job sent after a successful send", async () => {
    const deps = createDeps({ job: queuedJob });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com", idempotencyKey: "job-1" }),
    );
    expect(deps.runner.markJobSent).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        status: "sent",
        providerMessageId: "msg-1",
        updatedAt: 5000,
      }),
    );
  });

  it("returns early for terminal jobs without sending", async () => {
    const deps = createDeps({ job: { ...queuedJob, status: "failed" } });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.sender.send).not.toHaveBeenCalled();
    expect(deps.runner.markJobTerminal).not.toHaveBeenCalled();
  });

  it("marks suppressed when the recipient is suppressed", async () => {
    const deps = createDeps({ job: queuedJob, suppression: { id: "sup-1" } });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.markJobTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", status: "suppressed" }),
    );
    expect(deps.sender.send).not.toHaveBeenCalled();
  });

  it("suppresses the job without sending when policy disables it", async () => {
    const deps = createDeps({
      job: queuedJob,
      deliveryDecision: { enabled: false, reason: "globally_disabled" },
    });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.sender.send).not.toHaveBeenCalled();
    expect(deps.runner.markJobTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        status: "suppressed",
        errorCode: "notification_disabled",
        errorMessage: "globally_disabled",
      }),
    );
    expect(deps.runner.markJobSent).not.toHaveBeenCalled();
    expect(deps.runner.markJobRetrying).not.toHaveBeenCalled();
  });

  it("checks the latest policy on every attempt including retries", async () => {
    const deps = createDeps({
      job: { ...queuedJob, status: "retrying", attemptCount: 1, nextRetryAt: 4000 },
      deliveryDecision: { enabled: false, reason: "user_opted_out" },
    });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.getNotificationDeliveryDecision).toHaveBeenCalledWith({
      type: "email_delivery_test",
      channel: "email",
    });
    expect(deps.sender.send).not.toHaveBeenCalled();
    expect(deps.runner.markJobTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "suppressed", errorCode: "notification_disabled" }),
    );
  });

  it("passes recipientUserId to the policy check when present", async () => {
    const deps = createDeps({
      job: {
        ...queuedJob,
        templateType: "ai_review_required",
        payloadJson: JSON.stringify({ pendingCount: 3 }),
        recipientUserId: "user-1",
      },
    });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.getNotificationDeliveryDecision).toHaveBeenCalledWith({
      type: "ai_review_required",
      channel: "email",
      userId: "user-1",
    });
    expect(deps.sender.send).toHaveBeenCalled();
  });

  it("fails the job on invalid payload JSON", async () => {
    const deps = createDeps({ job: { ...queuedJob, payloadJson: "not-json" } });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.markJobTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "Invalid payload JSON",
        errorCode: "invalid_request",
      }),
    );
  });

  it("schedules a retry for retryable send failures", async () => {
    const deps = createDeps({
      job: queuedJob,
      sendResult: {
        ok: false,
        error: new EmailProviderError("server_error", "boom", true, "resend"),
      },
    });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.markJobRetrying).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        status: "retrying",
        attemptCount: 1,
        nextRetryAt: 5000 + 60 * 1000,
        errorCode: "server_error",
      }),
    );
    expect(deps.scheduler.scheduleProcessJob).toHaveBeenCalledWith(60 * 1000, "job-1");
  });

  it("fails non-retryable send failures without rescheduling", async () => {
    const deps = createDeps({
      job: queuedJob,
      sendResult: {
        ok: false,
        error: new EmailProviderError("invalid_request", "bad", false, "resend"),
      },
    });
    await processEmailJob(deps, { jobId: "job-1" });

    expect(deps.runner.markJobTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "invalid_request" }),
    );
    expect(deps.scheduler.scheduleProcessJob).not.toHaveBeenCalled();
  });
});
