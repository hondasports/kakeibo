import { describe, it, expect, vi } from "vitest";
import type { MutationCtx } from "../../_generated/server";
import { processResendEventHandler, resolveStatusAndSuppression } from "./processResendEvent";

function createMutationCtx({
  job = null,
  latestEvent = null,
  duplicate = null,
}: {
  job?: Record<string, unknown> | null;
  latestEvent?: Record<string, unknown> | null;
  duplicate?: Record<string, unknown> | null;
} = {}): MutationCtx {
  const runQuery = vi
    .fn()
    .mockResolvedValueOnce(duplicate)
    .mockResolvedValueOnce(job)
    .mockResolvedValueOnce(latestEvent);

  const runMutation = vi.fn().mockResolvedValue(undefined);

  const dbInsert = vi.fn().mockResolvedValue("event-1");

  const dbQuery = vi.fn().mockReturnValue({
    withIndex: vi.fn().mockReturnValue({ unique: vi.fn().mockResolvedValue(job) }),
  });

  return {
    db: {
      insert: dbInsert,
      query: dbQuery,
      get: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    runQuery,
    runMutation,
    auth: { getUserIdentity: vi.fn().mockResolvedValue(null) },
    scheduler: { runAfter: vi.fn().mockResolvedValue(undefined) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

describe("resolveStatusAndSuppression", () => {
  it("returns sent for email.sent", () => {
    expect(resolveStatusAndSuppression("email.sent", {})).toEqual({ statusUpdate: "sent" });
  });

  it("returns delivered for email.delivered", () => {
    expect(resolveStatusAndSuppression("email.delivered", {})).toEqual({
      statusUpdate: "delivered",
    });
  });

  it("returns undefined for email.delivery_delayed", () => {
    expect(resolveStatusAndSuppression("email.delivery_delayed", {})).toBeUndefined();
  });

  it("returns bounced with suppression for email.bounced", () => {
    expect(
      resolveStatusAndSuppression("email.bounced", { bounce: { type: "hard_bounce" } }),
    ).toEqual({
      statusUpdate: "bounced",
      suppressionReason: "bounce",
      suppressionSource: "hard_bounce",
    });
  });

  it("returns complained with suppression for email.complained", () => {
    expect(
      resolveStatusAndSuppression("email.complained", { complaint: { type: "abuse" } }),
    ).toEqual({
      statusUpdate: "complained",
      suppressionReason: "complaint",
      suppressionSource: "abuse",
    });
  });

  it("returns suppressed with suppression for email.suppressed", () => {
    expect(
      resolveStatusAndSuppression("email.suppressed", { suppressed: { type: "bounce" } }),
    ).toEqual({
      statusUpdate: "suppressed",
      suppressionReason: "provider_suppressed",
      suppressionSource: "bounce",
    });
  });

  it("returns failed for email.failed", () => {
    expect(resolveStatusAndSuppression("email.failed", {})).toEqual({ statusUpdate: "failed" });
  });
});

describe("processResendEventHandler", () => {
  it("inserts a webhook event and updates job on delivered", async () => {
    const ctx = createMutationCtx({ job: { _id: "job-1" } });

    const payload = {
      email_id: "msg-1",
      created_at: "2026-07-10T12:00:00Z",
      to: ["test@example.com"],
      from: "noreply@example.com",
      subject: "test",
    };

    await processResendEventHandler(ctx, {
      svixId: "svix-1",
      provider: "resend",
      eventType: "email.delivered",
      payloadJson: JSON.stringify(payload),
      eventCreatedAt: Date.parse("2026-07-10T12:00:00Z"),
      processedAt: 1000,
    });

    const dbInsert = ctx.db.insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "emailWebhookEvents",
      expect.objectContaining({
        svixId: "svix-1",
        provider: "resend",
        eventType: "email.delivered",
        providerMessageId: "msg-1",
        recipientEmail: "test@example.com",
        payloadJson: JSON.stringify(payload),
        processedAt: 1000,
      }),
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-1",
        status: "delivered",
      }),
    );
  });

  it("does not update job when a newer event has already been processed", async () => {
    const ctx = createMutationCtx({
      job: { _id: "job-1", lastVerifiedProviderEventAt: Date.parse("2026-07-10T13:00:00Z") },
    });

    const payload = {
      email_id: "msg-1",
      created_at: "2026-07-10T12:00:00Z",
      to: ["test@example.com"],
    };

    await processResendEventHandler(ctx, {
      svixId: "svix-1",
      provider: "resend",
      eventType: "email.delivered",
      payloadJson: JSON.stringify(payload),
      eventCreatedAt: Date.parse("2026-07-10T12:00:00Z"),
      processedAt: 1000,
    });

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("does nothing for duplicate svixId", async () => {
    const ctx = createMutationCtx({ duplicate: { _id: "event-1" } });

    await processResendEventHandler(ctx, {
      svixId: "svix-1",
      provider: "resend",
      eventType: "email.delivered",
      payloadJson: JSON.stringify({}),
      processedAt: 1000,
    });

    expect(ctx.db.insert).not.toHaveBeenCalled();
  });
});
