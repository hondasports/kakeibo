const STRICT_AFTER_MINUTES = 10;

export type StrictReverificationEvaluation = "satisfied" | "reverification_required" | "invalid";

function isValidFactorAge(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && (value === -1 || value >= 0);
}

/**
 * Clerk の `strict` reverification 設定に対応する fva 判定。
 * 第二要素が登録済みなら第二要素、なければ第一要素の経過分数を使う。
 */
export function evaluateStrictReverification(fva: unknown): StrictReverificationEvaluation {
  if (!Array.isArray(fva) || fva.length !== 2) return "invalid";
  const [firstFactorAge, secondFactorAge] = fva;
  if (!isValidFactorAge(firstFactorAge) || !isValidFactorAge(secondFactorAge)) return "invalid";
  if (firstFactorAge === -1 && secondFactorAge === -1) return "reverification_required";

  const factorAge = secondFactorAge === -1 ? firstFactorAge : secondFactorAge;
  return factorAge < STRICT_AFTER_MINUTES ? "satisfied" : "reverification_required";
}
