import { describe, expect, it, vi } from "vitest";
import type { ResendEventRunner } from "../../domain/email/runner";
import { processResendEvent } from "./processResendEvent";

function createDeps({
  duplicate = null,
  job = null,
  latestEvent = null,
}: {
  duplicate?: Record<string, unknown> | null;
  job?: Record<string, unknown> | null;
  latestEvent?: Record<string, unknown> | null;
} = {}) {
  const runner: ResendEventRunner = {
    findEventBySvixId: vi.fn().mockResolvedValue(duplicate),
    findJobByProviderMessageId: vi.fn().mockResolvedValue(job),
    findLatestEventForProviderMessageId: vi.fn().mockResolvedValue(latestEvent),
    updateJobStatusFromWebhook: vi.fn().mockResolvedValue(undefined),
    upsertSuppression: vi.fn().mockResolvedValue("sup-1"),
  };
  const events = { insertEvent: vi.fn().mockResolvedValue("event-1") };
  return { runner, events, now: () => 9999 };
}

const baseArgs = {
  svixId: "svix-1",
  provider: "resend",
  payloadJson: JSON.stringify({
    email_id: "msg-1",
    created_at: "2026-07-10T12:00:00Z",
    to: ["user@example.com"],
  }),
  processedAt: 1000,
};

describe("processResendEvent", () => {
  it("records the event then updates the job status", async () => {
    const deps = createDeps({ job: { id: "job-1" } });

    await processResendEvent(deps, { ...baseArgs, eventType: "email.delivered" });

    expect(deps.events.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        svixId: "svix-1",
        provider: "resend",
        eventType: "email.delivered",
        providerMessageId: "msg-1",
        recipientEmail: "user@example.com",
        processedAt: 1000,
      }),
    );
    expect(deps.runner.updateJobStatusFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        status: "delivered",
        lastProviderEventAt: Date.parse("2026-07-10T12:00:00Z"),
      }),
    );
  });

  it("returns early on duplicate svixId without inserting", async () => {
    const deps = createDeps({ duplicate: { id: "existing" } });

    await processResendEvent(deps, { ...baseArgs, eventType: "email.delivered" });

    expect(deps.events.insertEvent).not.toHaveBeenCalled();
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it("records the event but skips job update when a newer event exists", async () => {
    const deps = createDeps({
      job: { id: "job-1" },
      latestEvent: { eventCreatedAt: Date.parse("2026-07-10T13:00:00Z") },
    });

    await processResendEvent(deps, { ...baseArgs, eventType: "email.delivered" });

    expect(deps.events.insertEvent).toHaveBeenCalled();
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it("upserts suppression for bounce events", async () => {
    const deps = createDeps({ job: { id: "job-1" } });

    await processResendEvent(deps, {
      ...baseArgs,
      eventType: "email.bounced",
      payloadJson: JSON.stringify({
        email_id: "msg-1",
        created_at: "2026-07-10T12:00:00Z",
        to: ["user@example.com"],
        bounce: { type: "hard_bounce" },
      }),
    });

    expect(deps.runner.upsertSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        normalizedEmail: "user@example.com",
        reason: "bounce",
        source: "hard_bounce",
        providerMessageId: "msg-1",
      }),
    );
  });

  it("throws ConvexError on invalid payload JSON", async () => {
    const deps = createDeps();
    await expect(
      processResendEvent(deps, {
        ...baseArgs,
        eventType: "email.delivered",
        payloadJson: "not-json",
      }),
    ).rejects.toMatchObject({ data: "Invalid webhook payload JSON" });
  });
});
