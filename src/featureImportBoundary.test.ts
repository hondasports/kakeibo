import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// docs/technical-design.md §5.1「feature 間の import 方針」を本番コード（テスト以外）で検査する。
const sourceRoot = resolve(process.cwd(), "src");
const featuresRoot = join(sourceRoot, "features");
const BARREL_LESS_SHARED_FEATURES = new Set(["summary-shared", "receipt-review"]);
const ROUTER_FILE = join(sourceRoot, "router.tsx");

const isProductionSource = (file: string) =>
  /\.tsx?$/.test(file) &&
  !file.endsWith(".d.ts") &&
  !/\.test\.tsx?$/.test(file) &&
  !/TestMocks\.tsx?$/.test(file) &&
  !/testFixtures\.tsx?$/.test(file) &&
  !file.split(sep).includes("test");

const productionFiles = (readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }) as string[])
  .filter(isProductionSource)
  .map((file) => join(sourceRoot, file));

const RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g;

function featureOf(file: string): string | null {
  const fromFeatures = relative(featuresRoot, file);
  if (fromFeatures.startsWith("..")) return null;
  return fromFeatures.split(sep)[0] ?? null;
}

type Violation = string;

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    const importer = featureOf(file);
    for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
      const specifier = match[1];
      const target = resolve(dirname(file), specifier);
      const targetFeature = featureOf(target);
      if (targetFeature === null) continue;
      const insideTarget = relative(join(featuresRoot, targetFeature), target);
      const isBarrel = insideTarget === "" || /^index(\.tsx?)?$/.test(insideTarget);
      const at = `${relative(sourceRoot, file)} -> ${specifier}`;

      if (importer === targetFeature) {
        if (isBarrel) violations.push(`同一 feature 内で自分の barrel を import: ${at}`);
        continue;
      }
      if (isBarrel || BARREL_LESS_SHARED_FEATURES.has(targetFeature)) continue;
      if (file === ROUTER_FILE && insideTarget.split(sep)[0] === "pages") continue;
      violations.push(`barrel を迂回した import: ${at}`);
    }
  }
  return violations;
}

describe("feature 間の import 方針（docs/technical-design.md §5.1）", () => {
  it("barrel を持たない共有 feature は summary-shared と receipt-review で、どちらも index.ts を持たない", () => {
    for (const feature of BARREL_LESS_SHARED_FEATURES) {
      expect(existsSync(join(featuresRoot, feature))).toBe(true);
      expect(existsSync(join(featuresRoot, feature, "index.ts"))).toBe(false);
    }
  });

  it("feature 外・別 feature からは barrel 経由で import し、同一 feature 内では自分の barrel を使わない（router.tsx の pages/ と共有 feature は除く）", () => {
    expect(findViolations()).toEqual([]);
  });
});
