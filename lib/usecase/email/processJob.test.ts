import { describe, expect, it, vi } from "vitest";
import type { EmailJobActionRunner } from "../../domain/email/runner";
import { EmailProviderError } from "../../email/model";
import { processEmailJob } from "./processJob";

function createDeps({
  job,
  suppression = null,
  sendResult = { ok: true as const, providerMessageId: "msg-1" },
  now = () => 5000,
}: {
  job: Record<string, unknown> | null;
  suppression?: Record<string, unknown> | null;
  sendResult?: { ok: true; providerMessageId: string } | { ok: false; error: EmailProviderError };
  now?: () => number;
}) {
  const runner: EmailJobActionRunner = {
    getJob: vi.fn().mockResolvedValue(job),
    findSuppression: vi.fn().mockResolvedValue(suppression),
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
