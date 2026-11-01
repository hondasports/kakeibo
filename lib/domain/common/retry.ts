export const DEFAULT_RETRY_DELAYS_MS = [
  60 * 1000, // 1m
  5 * 60 * 1000, // 5m
  30 * 60 * 1000, // 30m
  2 * 60 * 60 * 1000, // 2h
  6 * 60 * 60 * 1000, // 6h
] as const;

export const DEFAULT_MAX_RETRY_ATTEMPTS = 6;

export function calculateRetryDelayMs(
  attemptCount: number,
  maxAttempts: number = DEFAULT_MAX_RETRY_ATTEMPTS,
): number | null {
  if (attemptCount >= maxAttempts || attemptCount < 1) {
    return null;
  }
  return DEFAULT_RETRY_DELAYS_MS[Math.min(attemptCount - 1, DEFAULT_RETRY_DELAYS_MS.length - 1)];
}

export function isMaxRetryAttemptsReached(
  attemptCount: number,
  maxAttempts: number = DEFAULT_MAX_RETRY_ATTEMPTS,
): boolean {
  return attemptCount >= maxAttempts;
}

export type RetryPlan =
  | {
      status: "retry_wait";
      attemptCount: number;
      delayMs: number;
      nextRetryAt: number;
    }
  | {
      status: "failed";
      attemptCount: number;
    };

export function planRetry(args: {
  attemptCount: number;
  maxAttempts: number;
  now: number;
}): RetryPlan {
  const attemptCount = args.attemptCount + 1;
  if (isMaxRetryAttemptsReached(attemptCount, args.maxAttempts)) {
    return { status: "failed", attemptCount };
  }

  const delayMs = calculateRetryDelayMs(attemptCount, args.maxAttempts);
  if (delayMs === null) {
    return { status: "failed", attemptCount };
  }

  return {
    status: "retry_wait",
    attemptCount,
    delayMs,
    nextRetryAt: args.now + delayMs,
  };
}
