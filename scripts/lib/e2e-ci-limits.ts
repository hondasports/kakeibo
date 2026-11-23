export const CI_MAX_FAILURES = 10;

export type E2ECiLimits = { maxFailures?: number; globalTimeout?: number };

/**
 * GitHub Actions（GITHUB_ACTIONS=true）のときだけPlaywrightの打ち切り設定を返す。ローカル実行では何も返さず挙動を変えない。
 * 不正なE2E_GLOBAL_TIMEOUT_MSは黙って無視せずエラーにする（無制限のまま job timeout で cancelled になるのを防ぐ）。
 */
export function resolveE2ECiLimits(env: NodeJS.ProcessEnv = process.env): E2ECiLimits {
  // CI=true は e2e:isolated の buildChildEnv がローカルでも強制するため判定に使えない。
  if (env.GITHUB_ACTIONS !== "true") return {};
  const limits: E2ECiLimits = { maxFailures: CI_MAX_FAILURES };
  const raw = env.E2E_GLOBAL_TIMEOUT_MS;
  if (raw === undefined || raw === "") return limits;
  const timeout = Number(raw);
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(timeout) || timeout < 1) {
    throw new Error("E2E_GLOBAL_TIMEOUT_MS には1以上の整数（ミリ秒）を指定してください");
  }
  return { ...limits, globalTimeout: timeout };
}
