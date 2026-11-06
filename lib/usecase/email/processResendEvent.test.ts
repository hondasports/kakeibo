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
    refreshLegacyJobRetention: vi.fn().mockResolvedValue(undefined),
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
  eventCreatedAt: Date.parse("2026-07-10T12:00:00Z"),
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
      job: { id: "job-1", lastVerifiedProviderEventAt: Date.parse("2026-07-10T13:00:00Z") },
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

  it.each([
    ["email.bounced", "bounce"],
    ["email.complained", "complaint"],
    ["email.suppressed", "provider_suppressed"],
  ] as const)("時刻の古い%sでも配信停止を登録する", async (eventType, reason) => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 10, lastVerifiedProviderEventAt: 3000 },
    });
    await processResendEvent(deps, {
      ...baseArgs,
      eventType,
      eventCreatedAt: 2000,
    });
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
    expect(deps.runner.upsertSuppression).toHaveBeenCalledWith(expect.objectContaining({ reason }));
  });

  it("旧形式の確定状態は処理時刻以前のイベントで巻き戻さない", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 3000, lastProviderEventAt: 1000 },
    });
    await processResendEvent(deps, { ...baseArgs, eventType: "email.sent", eventCreatedAt: 2000 });
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it.each([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.suppressed",
    "email.failed",
  ] as const)("旧形式の確定状態では%sを記録して状態変更しない", async (eventType) => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 1000, lastProviderEventAt: 100 },
    });
    await processResendEvent(deps, { ...baseArgs, eventType, eventCreatedAt: 5000 });
    expect(deps.events.insertEvent).toHaveBeenCalledOnce();
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
    if (["email.bounced", "email.complained", "email.suppressed"].includes(eventType)) {
      expect(deps.runner.upsertSuppression).toHaveBeenCalledOnce();
    }
  });

  it("旧形式で既に反映済みの同じstatusでも新しい時刻の水位を作らない", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 1000, lastProviderEventAt: 100 },
    });
    await processResendEvent(deps, {
      ...baseArgs,
      eventType: "email.delivered",
      eventCreatedAt: 5000,
    });
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it("新形式では同時刻に配信完了を送信より優先する", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "sent", updatedAt: 4000, lastVerifiedProviderEventAt: 3000 },
    });
    await processResendEvent(deps, {
      ...baseArgs,
      eventType: "email.delivered",
      eventCreatedAt: 3000,
    });
    expect(deps.runner.updateJobStatusFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered" }),
    );
  });

  it("同時刻の送信通知は配信完了を巻き戻さない", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 4000, lastVerifiedProviderEventAt: 3000 },
    });
    await processResendEvent(deps, { ...baseArgs, eventType: "email.sent", eventCreatedAt: 3000 });
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it("時刻のない旧actionのイベントは記録前に失敗して再送可能にする", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "delivered", updatedAt: 1000, lastVerifiedProviderEventAt: 3000 },
    });
    await expect(
      processResendEvent(deps, {
        ...baseArgs,
        eventType: "email.sent",
        eventCreatedAt: undefined,
      }),
    ).rejects.toMatchObject({ data: "Invalid webhook event timestamp" });
    expect(deps.events.insertEvent).not.toHaveBeenCalled();
    expect(deps.runner.updateJobStatusFromWebhook).not.toHaveBeenCalled();
  });

  it("状態を変えない後続イベントは配信完了を妨げない", async () => {
    const deps = createDeps({
      job: { id: "job-1", status: "sent", updatedAt: 1000, lastVerifiedProviderEventAt: 1500 },
      latestEvent: { eventCreatedAt: 3000, eventType: "email.delivery_delayed" },
    });
    await processResendEvent(deps, {
      ...baseArgs,
      eventType: "email.delivered",
      eventCreatedAt: 2000,
    });
    expect(deps.runner.updateJobStatusFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", lastVerifiedProviderEventAt: 2000 }),
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

  it.each(["null", "123", "[]"])(
    "throws ConvexError for non-object payload %s",
    async (payloadJson) => {
      const deps = createDeps();
      await expect(
        processResendEvent(deps, { ...baseArgs, eventType: "email.delivered", payloadJson }),
      ).rejects.toMatchObject({ data: "Invalid webhook payload JSON" });
    },
  );
});
