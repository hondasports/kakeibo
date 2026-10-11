import { APP_ENV_INVALID_MESSAGE, parseKnownAppEnv } from "../common/appEnv";

export type LineIntegrationMode = "mock" | "real";

export function resolveLineIntegrationMode(
  mode: string | undefined,
  appEnvironment: string | undefined,
): LineIntegrationMode {
  if (mode !== "mock" && mode !== "real") {
    throw new Error("LINE integration mode is unavailable");
  }
  if (mode === "mock") {
    // mock は development と明示された環境でのみ許可する（未設定・不正値は fail-closed）
    const appEnv = parseKnownAppEnv(appEnvironment);
    if (appEnv === undefined) throw new Error(APP_ENV_INVALID_MESSAGE);
    if (appEnv === "production") throw new Error("LINE mock mode is not available in production");
  }
  return mode;
}
