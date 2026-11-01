import { describe, expect, it } from "vitest";
import {
  calculateRetryDelayMs,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAYS_MS,
  isMaxRetryAttemptsReached,
  planRetry,
} from "./retry";

describe("retry helpers", () => {
  it("試行回数に応じた遅延を返す", () => {
    expect(calculateRetryDelayMs(1)).toBe(DEFAULT_RETRY_DELAYS_MS[0]);
    expect(calculateRetryDelayMs(2)).toBe(DEFAULT_RETRY_DELAYS_MS[1]);
    expect(calculateRetryDelayMs(5)).toBe(DEFAULT_RETRY_DELAYS_MS[4]);
  });

  it("最大試行回数以上または1未満の場合は null を返す", () => {
    expect(calculateRetryDelayMs(6)).toBeNull();
    expect(calculateRetryDelayMs(7)).toBeNull();
    expect(calculateRetryDelayMs(0)).toBeNull();
  });

  it("遅延表を超える試行回数は、上限未満なら最後の遅延を返す", () => {
    expect(calculateRetryDelayMs(6, 8)).toBe(DEFAULT_RETRY_DELAYS_MS[4]);
    expect(calculateRetryDelayMs(7, 8)).toBe(DEFAULT_RETRY_DELAYS_MS[4]);
    expect(calculateRetryDelayMs(8, 8)).toBeNull();
  });

  it("最大試行回数に達したかどうかを判定する", () => {
    expect(isMaxRetryAttemptsReached(DEFAULT_MAX_RETRY_ATTEMPTS - 1)).toBe(false);
    expect(isMaxRetryAttemptsReached(DEFAULT_MAX_RETRY_ATTEMPTS)).toBe(true);
    expect(isMaxRetryAttemptsReached(DEFAULT_MAX_RETRY_ATTEMPTS + 1)).toBe(true);
  });

  it("指定した上限で最大試行回数への到達を判定する", () => {
    expect(isMaxRetryAttemptsReached(5, 8)).toBe(false);
    expect(isMaxRetryAttemptsReached(8, 8)).toBe(true);
  });
});

describe("planRetry", () => {
  it("上限未満は試行回数に応じた遅延で retry_wait を返す", () => {
    expect(planRetry({ attemptCount: 0, maxAttempts: 6, now: 1_000 })).toEqual({
      status: "retry_wait",
      attemptCount: 1,
      delayMs: 60_000,
      nextRetryAt: 61_000,
    });
    expect(planRetry({ attemptCount: 4, maxAttempts: 6, now: 1_000 })).toEqual({
      status: "retry_wait",
      attemptCount: 5,
      delayMs: 21_600_000,
      nextRetryAt: 21_601_000,
    });
  });

  it("attemptCount+1 が上限以上なら failed を返す", () => {
    expect(planRetry({ attemptCount: 5, maxAttempts: 6, now: 1_000 })).toEqual({
      status: "failed",
      attemptCount: 6,
    });
    expect(planRetry({ attemptCount: 7, maxAttempts: 6, now: 1_000 })).toEqual({
      status: "failed",
      attemptCount: 8,
    });
  });

  it("maxAttempts が遅延表より長いときは上限まで最後の遅延で retry_wait を返す", () => {
    expect(planRetry({ attemptCount: 5, maxAttempts: 8, now: 1_000 })).toEqual({
      status: "retry_wait",
      attemptCount: 6,
      delayMs: 21_600_000,
      nextRetryAt: 21_601_000,
    });
    expect(planRetry({ attemptCount: 6, maxAttempts: 8, now: 1_000 })).toEqual({
      status: "retry_wait",
      attemptCount: 7,
      delayMs: 21_600_000,
      nextRetryAt: 21_601_000,
    });
    expect(planRetry({ attemptCount: 7, maxAttempts: 8, now: 1_000 })).toEqual({
      status: "failed",
      attemptCount: 8,
    });
  });
});
