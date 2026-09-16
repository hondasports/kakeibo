import { describe, expect, it } from "vitest";
import {
  EMAIL_CLEANUP_BATCH_SIZE,
  buildNewEmailJobFields,
  emailCleanupCutoff,
  extractResendEventFields,
  isResendWebhookEventType,
  isStaleWebhookEvent,
  isTerminalEmailJobStatus,
  planSendFailure,
  shouldContinueEmailCleanup,
} from "./rules";
import { EmailProviderError } from "../../email/model";

describe("isTerminalEmailJobStatus", () => {
  it.each(["sent", "delivered", "bounced", "complained", "suppressed", "failed"] as const)(
    "treats %s as terminal",
    (status) => {
      expect(isTerminalEmailJobStatus(status)).toBe(true);
    },
  );

  it.each(["queued", "processing", "retrying"] as const)("treats %s as non-terminal", (status) => {
    expect(isTerminalEmailJobStatus(status)).toBe(false);
  });
});

describe("buildNewEmailJobFields", () => {
  it("builds queued job fields with defaults", () => {
    expect(
      buildNewEmailJobFields({
        templateType: "email_delivery_test",
        payloadJson: "{}",
        recipientEmail: "Test@Example.com",
        normalizedRecipientEmail: "test@example.com",
        subject: "subject",
        now: 1000,
      }),
    ).toEqual({
      templateType: "email_delivery_test",
      payloadJson: "{}",
      recipientEmail: "Test@Example.com",
      normalizedRecipientEmail: "test@example.com",
      subject: "subject",
      provider: "resend",
      status: "queued",
      attemptCount: 0,
      maxAttempts: 6,
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("omits businessDedupeKey when not provided", () => {
    const fields = buildNewEmailJobFields({
      templateType: "group_deleted",
      payloadJson: "{}",
      recipientEmail: "a@example.com",
      normalizedRecipientEmail: "a@example.com",
      subject: "s",
      now: 1,
    });
    expect("businessDedupeKey" in fields).toBe(false);
  });

  it("includes businessDedupeKey when provided", () => {
    const fields = buildNewEmailJobFields({
      templateType: "group_deleted",
      payloadJson: "{}",
      recipientEmail: "a@example.com",
      normalizedRecipientEmail: "a@example.com",
      subject: "s",
      businessDedupeKey: "dedupe-1",
      now: 1,
    });
    expect(fields.businessDedupeKey).toBe("dedupe-1");
  });
});

describe("planSendFailure", () => {
  const retryableError = new EmailProviderError("server_error", "boom", true, "resend");
  const fatalError = new EmailProviderError("invalid_request", "bad", false, "resend");

  it("plans retry with delay for a retryable error", () => {
    expect(planSendFailure(retryableError, 1, 1000)).toEqual({
      kind: "retry",
      nextAttempt: 1,
      nextRetryAt: 1000 + 60 * 1000,
      delayMs: 60 * 1000,
    });
  });

  it("uses the retry delay table per attempt", () => {
    expect(planSendFailure(retryableError, 3, 0)).toEqual({
      kind: "retry",
      nextAttempt: 3,
      nextRetryAt: 30 * 60 * 1000,
      delayMs: 30 * 60 * 1000,
    });
  });

  it("fails immediately for non-retryable errors", () => {
    expect(planSendFailure(fatalError, 1, 0)).toEqual({ kind: "failed" });
  });

  it("fails when max attempts reached", () => {
    expect(planSendFailure(retryableError, 6, 0)).toEqual({ kind: "failed" });
  });
});

describe("extractResendEventFields", () => {
  it("extracts providerMessageId, first recipient, and parsed created_at", () => {
    expect(
      extractResendEventFields({
        email_id: "msg-1",
        created_at: "2026-07-10T12:00:00Z",
        to: ["a@example.com", "b@example.com"],
      }),
    ).toEqual({
      providerMessageId: "msg-1",
      recipientEmail: "a@example.com",
      eventCreatedAt: Date.parse("2026-07-10T12:00:00Z"),
    });
  });

  it("returns undefined eventCreatedAt for unparseable timestamps", () => {
    expect(extractResendEventFields({ created_at: "not-a-date" }).eventCreatedAt).toBeUndefined();
  });
});

describe("isStaleWebhookEvent", () => {
  it("is stale only when the latest event is newer and both timestamps exist", () => {
    expect(isStaleWebhookEvent(2000, 1000)).toBe(true);
    expect(isStaleWebhookEvent(1000, 2000)).toBe(false);
    expect(isStaleWebhookEvent(undefined, 1000)).toBe(false);
    expect(isStaleWebhookEvent(2000, undefined)).toBe(false);
    expect(isStaleWebhookEvent(1000, 1000)).toBe(false);
  });
});

describe("cleanup rules", () => {
  it("cutoff subtracts 30 days", () => {
    expect(emailCleanupCutoff(30 * 24 * 60 * 60 * 1000 + 500)).toBe(500);
  });

  it("continues when either side reaches the batch size", () => {
    expect(shouldContinueEmailCleanup(EMAIL_CLEANUP_BATCH_SIZE, 0)).toBe(true);
    expect(shouldContinueEmailCleanup(0, EMAIL_CLEANUP_BATCH_SIZE)).toBe(true);
    expect(shouldContinueEmailCleanup(99, 99)).toBe(false);
  });
});

describe("isResendWebhookEventType", () => {
  it("accepts supported types", () => {
    expect(isResendWebhookEventType("email.delivered")).toBe(true);
    expect(isResendWebhookEventType("email.bounced")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isResendWebhookEventType("email.clicked")).toBe(false);
    expect(isResendWebhookEventType("email.opened")).toBe(false);
  });
});
