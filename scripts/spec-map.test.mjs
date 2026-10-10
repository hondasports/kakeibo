import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { globToRegExp, listSpecFiles, loadSpecMap } from "./select-e2e-specs.mjs";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** e2e/spec-map.json の整合性検査（Issue #957 AC6）。 */
describe("e2e/spec-map.json", () => {
  const map = loadSpecMap();
  const specFiles = listSpecFiles();
  const patterns = Object.keys(map).filter((key) => !key.startsWith("$"));

  test("mapに書かれたspecはすべてe2e/直下に実在する（globは1件以上に展開される）", () => {
    const problems = [];
    for (const pattern of patterns) {
      for (const specPattern of map[pattern]) {
        if (specPattern.includes("*") || specPattern.includes("?")) {
          const re = globToRegExp(specPattern);
          if (!specFiles.some((spec) => re.test(spec))) {
            problems.push(`${pattern} -> ${specPattern} (globが0件)`);
          }
        } else if (!existsSync(path.join(repoRoot, specPattern))) {
          problems.push(`${pattern} -> ${specPattern} (ファイルなし)`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("src/features/* の全ディレクトリがmapのどこかに含まれる", () => {
    const featuresDir = path.join(repoRoot, "src", "features");
    const featureDirs = readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `src/features/${entry.name}/`);
    const compiled = patterns.map((pattern) => globToRegExp(pattern));
    const missing = featureDirs.filter(
      (dir) => !compiled.some((re) => re.test(`${dir}x.ts`) || re.test(dir)),
    );
    expect(missing).toEqual([]);
  });

  test("convex/* の全サブディレクトリがmapのどこかに含まれる", () => {
    const convexDir = path.join(repoRoot, "convex");
    const convexDirs = readdirSync(convexDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_generated")
      .map((entry) => `convex/${entry.name}/`);
    const compiled = patterns.map((pattern) => globToRegExp(pattern));
    const missing = convexDirs.filter(
      (dir) => !compiled.some((re) => re.test(`${dir}x.ts`) || re.test(dir)),
    );
    expect(missing).toEqual([]);
  });
});
