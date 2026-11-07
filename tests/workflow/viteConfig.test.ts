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

test("アプリ所有のテストを保持し、外部スキルの実体とリンクを収集しない", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const root = mkdtempSync(path.join(tmpdir(), "vitest-collection-"));
  try {
    mkdirSync(path.join(root, ".agents", "skills", "demo"), { recursive: true });
    mkdirSync(path.join(root, "skills"));
    mkdirSync(path.join(root, "src"));
    writeFileSync(
      path.join(root, ".agents", "skills", "demo", "external.test.cjs"),
      'require("node:test").test("external", () => {});',
    );
    symlinkSync(path.join(root, ".agents"), path.join(root, ".claude"), "dir");
    symlinkSync(path.join(root, ".agents"), path.join(root, ".devin"), "dir");
    writeFileSync(path.join(root, "skills", "skills.test.mjs"), "export {};\n");
    writeFileSync(path.join(root, "src", "app.test.ts"), "export {};\n");
    for (const coverage of [false, true]) {
      const args = [
        path.resolve("node_modules/vitest/vitest.mjs"),
        "list",
        "--filesOnly",
        "--root",
        root,
        "--config",
        path.resolve("vite.config.ts"),
      ];
      if (coverage) args.push("--coverage");
      const files = execFileSync(process.execPath, args, { encoding: "utf8", cwd: root })
        .trim()
        .split("\n")
        .sort();
      expect(files).toHaveLength(2);
      expect(files.some((file) => file.endsWith("skills/skills.test.mjs"))).toBe(true);
      expect(files.some((file) => file.endsWith("src/app.test.ts"))).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
