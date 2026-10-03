import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionCtx } from "../_generated/server";
import { processEmailJobHandler } from "./actions";

function createActionCtx({
  job,
  suppression,
  deliveryDecision = { enabled: true },
  deliveryDecisionError,
  mutationResult = undefined,
}: {
  job: Record<string, unknown> | null;
  suppression?: Record<string, unknown> | null;
  deliveryDecision?: { enabled: boolean; reason?: string };
  deliveryDecisionError?: Error;
  mutationResult?: unknown;
}): ActionCtx {
  const runQuery = vi
    .fn()
    .mockImplementation(
      async (
        ref: unknown,
        args: { normalizedEmail?: string } | { jobId?: string } | { type: string; userId?: string },
      ) => {
        if ("normalizedEmail" in args) {
          return suppression ?? null;
        }
        if ("jobId" in args) {
          return job;
        }
        if ("type" in args) {
          if (deliveryDecisionError) throw deliveryDecisionError;
          return deliveryDecision;
        }
        return null;
      },
    );
  const runMutation = vi.fn().mockResolvedValue(mutationResult);
  const schedulerRunAfter = vi.fn().mockResolvedValue(undefined);

  return {
    runQuery,
    runMutation,
    scheduler: { runAfter: schedulerRunAfter },
    auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ActionCtx;
}

const queuedJob = {
  _id: "job-123",
  status: "queued",
  normalizedRecipientEmail: "test@example.com",
  recipientEmail: "test@example.com",
  templateType: "email_delivery_test",
  payloadJson: JSON.stringify({ to: "test@example.com", groupName: "Demo" }),
  subject: "Suzumemo メール配信テスト",
  attemptCount: 0,
};

describe("processEmailJobHandler", () => {
  beforeEach(() => {
    process.env.APP_ENV = "development";
    process.env.RESEND_FROM_ADDRESS = "Suzumemo <noreply@example.com>";
  });

  it("sends a mock email and updates job to sent", async () => {
    const ctx = createActionCtx({ job: queuedJob });

    await processEmailJobHandler(ctx, { jobId: "job-123" as any });

    expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(), { jobId: "job-123" });
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-123",
        status: "sent",
        providerMessageId: "mock-job-123",
      }),
    );
  });

  it("suppresses the job when recipient is suppressed", async () => {
    const ctx = createActionCtx({ job: queuedJob, suppression: { _id: "sup-1" } });

    await processEmailJobHandler(ctx, { jobId: "job-123" as any });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-123",
        status: "suppressed",
      }),
    );
  });

  it("marks suppressed without sending when the delivery decision is disabled", async () => {
    const ctx = createActionCtx({
      job: queuedJob,
      deliveryDecision: { enabled: false, reason: "globally_disabled" },
    });

    await processEmailJobHandler(ctx, { jobId: "job-123" as any });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-123",
        status: "suppressed",
        errorCode: "notification_disabled",
      }),
    );
    expect(ctx.runMutation).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "sent" }),
    );
  });

  it("reschedules the same job when the delivery decision query is temporarily unavailable", async () => {
    const ctx = createActionCtx({
      job: queuedJob,
      deliveryDecisionError: new Error("temporary query failure"),
    });

    await processEmailJobHandler(ctx, { jobId: "job-123" as any });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-123",
        status: "retrying",
        attemptCount: 1,
        errorCode: "notification_decision_unavailable",
      }),
    );
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(60 * 1000, expect.anything(), {
      jobId: "job-123",
    });
  });

  it("does nothing when job is already in a terminal state", async () => {
    const ctx = createActionCtx({ job: { ...queuedJob, status: "sent" } });

    await processEmailJobHandler(ctx, { jobId: "job-123" as any });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
