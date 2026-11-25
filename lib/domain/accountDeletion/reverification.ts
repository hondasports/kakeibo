const STRICT_AFTER_MINUTES = 10;
const CLERK_IAT_FUTURE_TOLERANCE_SECONDS = 5;

export const ACCOUNT_DELETION_REAUTHENTICATION_FAILED_CODE =
  "ACCOUNT_DELETION_REAUTHENTICATION_FAILED";

export type StrictReverificationEvaluation = "satisfied" | "reverification_required" | "invalid";

type StrictReverificationInput = {
  fva: unknown;
  iat: unknown;
  nowInSeconds: number;
};

function isValidFactorAge(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && (value === -1 || value >= 0);
}

function isValidIat(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clerk の `strict` reverification 設定に対応する fva 判定。
 * fva はtoken発行時点の経過分数なので、発行からの経過時間を安全側に切り上げて足す。
 * 第二要素が登録済みなら第二要素、なければ第一要素の経過分数を使う。
 */
export function evaluateStrictReverification({
  fva,
  iat,
  nowInSeconds,
}: StrictReverificationInput): StrictReverificationEvaluation {
  if (!isValidIat(iat) || !Number.isFinite(nowInSeconds)) return "invalid";
  if (iat - nowInSeconds > CLERK_IAT_FUTURE_TOLERANCE_SECONDS) return "invalid";
  if (!Array.isArray(fva) || fva.length !== 2) return "invalid";
  const [firstFactorAge, secondFactorAge] = fva;
  if (!isValidFactorAge(firstFactorAge) || !isValidFactorAge(secondFactorAge)) return "invalid";
  if (firstFactorAge === -1 && secondFactorAge === -1) return "reverification_required";

  const elapsedSecondsSinceIssue = Math.max(0, nowInSeconds - iat);
  const elapsedMinutesSinceIssue = Math.ceil(elapsedSecondsSinceIssue / 60);
  const effectiveFirstFactorAge =
    firstFactorAge === -1 ? -1 : firstFactorAge + elapsedMinutesSinceIssue;
  const effectiveSecondFactorAge =
    secondFactorAge === -1 ? -1 : secondFactorAge + elapsedMinutesSinceIssue;
  const factorAge =
    effectiveSecondFactorAge === -1 ? effectiveFirstFactorAge : effectiveSecondFactorAge;
  return factorAge < STRICT_AFTER_MINUTES ? "satisfied" : "reverification_required";
}
