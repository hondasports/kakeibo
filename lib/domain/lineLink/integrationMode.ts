export type LineIntegrationMode = "mock" | "real";

export function resolveLineIntegrationMode(
  mode: string | undefined,
  appEnvironment: string | undefined,
): LineIntegrationMode {
  if (mode !== "mock" && mode !== "real") {
    throw new Error("LINE integration mode is unavailable");
  }
  if (mode === "mock" && appEnvironment === "production") {
    throw new Error("LINE mock mode is not available in production");
  }
  return mode;
}
