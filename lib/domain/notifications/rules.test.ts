import { describe, expect, it } from "vitest";
import {
  LINE_NOTIFICATION_LEASE_MS,
  LINE_RETRY_KEY_TTL_MS,
  buildAiReviewEmailDedupeKey,
  buildAiReviewLineText,
  getLineNotificationExhaustionErrorCode,
  isLineNotificationJobDue,
  isValidRetryKey,
  planLineNotificationRetry,
} from "./rules";

describe("isLineNotificationJobDue", () => {
  const base = { nextRetryAt: undefined, leaseUntil: undefined };

  it("queued jobs are always due", () => {
    expect(isLineNotificationJobDue({ ...base, status: "queued" }, 1000)).toBe(true);
  });

  it("retrying jobs are due only at or after nextRetryAt", () => {
    const job = { ...base, status: "retrying" as const, nextRetryAt: 2000 };
    expect(isLineNotificationJobDue(job, 1999)).toBe(false);
    expect(isLineNotificationJobDue(job, 2000)).toBe(true);
    expect(isLineNotificationJobDue(job, 3000)).toBe(true);
  });

  it("processing jobs are due only after lease expiry", () => {
    const job = { ...base, status: "processing" as const, leaseUntil: 5000 };
    expect(isLineNotificationJobDue(job, 4999)).toBe(false);
    expect(isLineNotificationJobDue(job, 5000)).toBe(true);
  });

  it("terminal jobs are never due", () => {
    for (const status of ["sent", "suppressed", "failed"] as const) {
      expect(isLineNotificationJobDue({ ...base, status }, Number.MAX_SAFE_INTEGER)).toBe(false);
    }
  });
});

describe("planLineNotificationRetry", () => {
  it.each([
    [1, 60 * 1000],
    [2, 5 * 60 * 1000],
    [3, 30 * 60 * 1000],
    [4, 2 * 60 * 60 * 1000],
    [5, 6 * 60 * 60 * 1000],
  ])("attempt %i failed schedules retry after %i ms", (attemptCount, delayMs) => {
    const now = 10_000;
    const plan = planLineNotificationRetry({ attemptCount, firstAttemptAt: 0, now });
    expect(plan).toEqual({ kind: "retry", nextRetryAt: now + delayMs, delayMs });
  });

  it("attempt 6 exhausts the max attempt budget", () => {
    const plan = planLineNotificationRetry({ attemptCount: 6, firstAttemptAt: 0, now: 1000 });
    expect(plan).toEqual({ kind: "exhausted", errorCode: "max_attempts_reached" });
  });

  it("expires when nextRetryAt would land on or after firstAttemptAt + 24h", () => {
    const firstAttemptAt = 0;
    const delayMs = 60 * 1000;
    const deadline = firstAttemptAt + LINE_RETRY_KEY_TTL_MS;
    for (const now of [deadline - delayMs - 1, deadline - delayMs, deadline - delayMs + 1]) {
      const plan = planLineNotificationRetry({ attemptCount: 1, firstAttemptAt, now });
      if (now + delayMs >= deadline) {
        expect(plan).toEqual({ kind: "exhausted", errorCode: "retry_key_expired" });
      } else {
        expect(plan).toEqual({
          kind: "retry",
          nextRetryAt: now + delayMs,
          delayMs,
        });
      }
    }
  });
});

describe("getLineNotificationExhaustionErrorCode", () => {
  it("returns max_attempts_reached at the attempt budget", () => {
    expect(getLineNotificationExhaustionErrorCode({ attemptCount: 6, firstAttemptAt: 0 }, 0)).toBe(
      "max_attempts_reached",
    );
    expect(
      getLineNotificationExhaustionErrorCode({ attemptCount: 5, firstAttemptAt: 0 }, 0),
    ).toBeNull();
  });

  it("returns retry_key_expired at or after firstAttemptAt + 24h and preserves firstAttemptAt=0", () => {
    const deadline = LINE_RETRY_KEY_TTL_MS;
    expect(
      getLineNotificationExhaustionErrorCode({ attemptCount: 1, firstAttemptAt: 0 }, deadline - 1),
    ).toBeNull();
    expect(
      getLineNotificationExhaustionErrorCode({ attemptCount: 1, firstAttemptAt: 0 }, deadline),
    ).toBe("retry_key_expired");
    expect(
      getLineNotificationExhaustionErrorCode({ attemptCount: 1, firstAttemptAt: 0 }, deadline + 1),
    ).toBe("retry_key_expired");
    expect(
      getLineNotificationExhaustionErrorCode({ attemptCount: 1 }, Number.MAX_SAFE_INTEGER),
    ).toBeNull();
  });
});

describe("isValidRetryKey", () => {
  it("accepts UUIDs and rejects other strings", () => {
    expect(isValidRetryKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidRetryKey("not-a-uuid")).toBe(false);
    expect(isValidRetryKey("")).toBe(false);
    expect(isValidRetryKey("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});

describe("buildAiReviewEmailDedupeKey / buildAiReviewLineText", () => {
  it("dedupe key is deterministic per batch", () => {
    expect(buildAiReviewEmailDedupeKey("batch-1")).toBe("ai-review-required/batch-1");
  });

  it("line text contains pending count, input link and settings link", () => {
    process.env.APP_BASE_URL = "https://suzumemo.test";
    const text = buildAiReviewLineText(3);
    expect(text).toContain("3件");
    expect(text).toContain("https://suzumemo.test/weeks/current/input");
    expect(text).toContain("https://suzumemo.test/settings#notifications");
    expect(text).not.toContain("金額");
  });

  it("lease is 30 seconds", () => {
    expect(LINE_NOTIFICATION_LEASE_MS).toBe(30_000);
  });
});
