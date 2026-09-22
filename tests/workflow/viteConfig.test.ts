import { describe, expect, test } from "vitest";
import { resolveAppVersion } from "../../vite.config";

describe("Vite config", () => {
  test("uses a local app version when no release version is provided", () => {
    expect(resolveAppVersion(undefined)).toBe("local");
  });

  test("preserves the generated release version", () => {
    expect(resolveAppVersion("2026.07.15-471")).toBe("2026.07.15-471");
  });
});
