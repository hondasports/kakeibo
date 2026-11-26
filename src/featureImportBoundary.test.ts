import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

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

type ModuleReference = { specifier: string | null; source: string; dynamic: boolean };

function moduleReferences(file: string, code = readFileSync(file, "utf8")): ModuleReference[] {
  const { module } = parseSync(file, code);
  const references: ModuleReference[] = [];
  for (const item of module.staticImports) {
    references.push({
      specifier: item.moduleRequest.value,
      source: item.moduleRequest.value,
      dynamic: false,
    });
  }
  for (const item of module.staticExports) {
    for (const entry of item.entries) {
      if (entry.moduleRequest) {
        references.push({
          specifier: entry.moduleRequest.value,
          source: entry.moduleRequest.value,
          dynamic: false,
        });
      }
    }
  }
  for (const item of module.dynamicImports) {
    const source = code.slice(item.moduleRequest.start, item.moduleRequest.end);
    let expression = source.trim();
    for (
      let inner = /^\(([\s\S]*)\)$/.exec(expression);
      inner;
      inner = /^\(([\s\S]*)\)$/.exec(expression)
    ) {
      expression = inner[1].trim();
    }
    const literal = /^(["'`])([^"'`$]*)\1$/.exec(expression);
    references.push({ specifier: literal ? literal[2] : null, source, dynamic: true });
  }
  return references;
}

function featureOf(file: string): string | null {
  const fromFeatures = relative(featuresRoot, file);
  if (fromFeatures.startsWith("..")) return null;
  return fromFeatures.split(sep)[0] ?? null;
}

const stripExtension = (file: string) => file.replace(/\.tsx?$/, "");

function barrelExportedFiles(feature: string): Set<string> {
  const barrel = join(featuresRoot, feature, "index.ts");
  if (!existsSync(barrel)) return new Set();
  return new Set(
    moduleReferences(barrel)
      .filter((reference) => reference.specifier?.startsWith("."))
      .map((reference) => stripExtension(resolve(dirname(barrel), reference.specifier as string))),
  );
}

function findViolations(): string[] {
  const violations: string[] = [];
  for (const file of productionFiles) {
    const importer = featureOf(file);
    for (const { specifier, source, dynamic } of moduleReferences(file)) {
      const at = `${relative(sourceRoot, file)} -> ${source}`;
      if (specifier === null) {
        violations.push(`静的に解決できない動的 import: ${at}`);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const target = stripExtension(resolve(dirname(file), specifier));
      const targetFeature = featureOf(target);
      if (targetFeature === null) continue;
      const insideTarget = relative(join(featuresRoot, targetFeature), target);
      const isBarrel = insideTarget === "" || insideTarget === "index";

      if (importer === targetFeature) {
        if (isBarrel) violations.push(`同一 feature 内で自分の barrel を import: ${at}`);
        continue;
      }
      if (isBarrel || BARREL_LESS_SHARED_FEATURES.has(targetFeature)) continue;
      if (file === ROUTER_FILE && insideTarget.split(sep)[0] === "pages") {
        if (dynamic || !barrelExportedFiles(targetFeature).has(target)) continue;
        violations.push(`barrel で公開済みの page を router が静的に直接 import: ${at}`);
        continue;
      }
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

  it("import の参照先を構文から取り出す（コメントは無視し、括弧・テンプレートリテラルで囲んだ文字列は値を取り、式の動的 import は解決不能とする）", () => {
    const code = [
      '// import { commented } from "../../auth/hooks/signOutState";',
      'import { a } from "../../auth";',
      'export { b } from "./b";',
      'const c = () => import(("../../auth/hooks/signOutState"));',
      "const d = () => import(('react-router-dom'));",
      "const e = () => import(`../../week`);",
      "const f = (name: string) => import(`../../${name}`);",
    ].join("\n");
    expect(
      moduleReferences("sample.tsx", code).map(({ specifier, dynamic }) => ({
        specifier,
        dynamic,
      })),
    ).toEqual([
      { specifier: "../../auth", dynamic: false },
      { specifier: "./b", dynamic: false },
      { specifier: "../../auth/hooks/signOutState", dynamic: true },
      { specifier: "react-router-dom", dynamic: true },
      { specifier: "../../week", dynamic: true },
      { specifier: null, dynamic: true },
    ]);
  });

  it("feature 外・別 feature からは barrel 経由で import し、同一 feature 内では自分の barrel を使わない（共有 feature と、router.tsx が lazy load する page・barrel に無い page は除く）", () => {
    expect(findViolations()).toEqual([]);
  });
});
