import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * lib/domain の production モジュールが Convex adapter（convex/・lib/convex/）や
 * convex パッケージへ依存しないことを検査する。
 * *.test.*・fixtures/・*testHelpers.ts は test-only の adapter fixture 参照を
 * 含みうるため対象外（#1143 では testHelpers.ts の adapter 参照を別課題として切り分け）。
 */
const REPO_ROOT = process.cwd();
const DOMAIN_ROOT = join(REPO_ROOT, "lib", "domain");
const CONVEX_DIRS = [join(REPO_ROOT, "convex"), join(REPO_ROOT, "lib", "convex")];

const TEST_ONLY_FILE = /(?:\.test\.|testHelpers\.ts$|\/fixtures\/)/;
const SCANNED_FILE = /\.(?:ts|tsx|mts|cts)$/;
const IMPORT_SPECIFIER =
  /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function isConvexReference(filePath: string, specifier: string): boolean {
  if (specifier === "convex" || specifier.startsWith("convex/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = resolve(dirname(filePath), specifier);
  return CONVEX_DIRS.some((dir) => resolved === dir || resolved.startsWith(dir + sep));
}

function collectViolations(): string[] {
  const violations: string[] = [];
  for (const entry of readdirSync(DOMAIN_ROOT, { recursive: true })) {
    if (!SCANNED_FILE.test(entry) || TEST_ONLY_FILE.test(entry)) continue;
    const filePath = join(DOMAIN_ROOT, entry);
    if (!statSync(filePath).isFile()) continue;
    for (const match of readFileSync(filePath, "utf8").matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (isConvexReference(filePath, specifier)) {
        violations.push(`${entry} imports ${specifier}`);
      }
    }
  }
  return violations;
}

describe("domain → adapter 依存方向", () => {
  it("lib/domain の production モジュールは convex 参照を import しない", () => {
    expect(collectViolations()).toEqual([]);
  });
});
