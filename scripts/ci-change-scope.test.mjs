import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { parse } from "yaml";

import { ciCodeChanged, ciMappedUnitTests, runCiChangeScope } from "./ci-change-scope.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [];

function tmpdirFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "ci-scope-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe("ciCodeChanged", () => {
  test.each([
    [["docs/guide.md", "README.md"], false],
    [["docs/guide.md", "src/App.tsx"], true],
    [[], true],
    [["README.md"], false],
    [[".github/ISSUE_TEMPLATE/bug.yml"], true],
    [[".github/workflows/ci.yml"], true],
    [["docs/design.md", "scripts/verify-prepush.mjs"], true],
    [["CHANGELOG.md", "AGENTS.md"], false],
  ])("paths %j -> %s", (paths, expected) => {
    expect(ciCodeChanged(paths)).toBe(expected);
  });
});

describe("ciMappedUnitTests", () => {
  test("AGENTS.md の変更は skills/skills.test.mjs を対応づける", () => {
    expect(ciMappedUnitTests(["AGENTS.md"], { cwd: repoRoot })).toEqual(["skills/skills.test.mjs"]);
  });

  test("README.md は skills.test.mjs と localConvexWorkflow.test.ts の両方", () => {
    expect(ciMappedUnitTests(["README.md"], { cwd: repoRoot })).toEqual([
      "skills/skills.test.mjs",
      "tests/workflow/localConvexWorkflow.test.ts",
    ]);
  });

  test("mapに当たらない変更は空", () => {
    expect(ciMappedUnitTests(["src/App.tsx"], { cwd: repoRoot })).toEqual([]);
  });

  test("mapにあって存在しないテストは対象外", () => {
    expect(
      ciMappedUnitTests(["AGENTS.md"], {
        cwd: repoRoot,
        unitMap: { "**/*.md": ["ghost.test.ts"] },
      }),
    ).toEqual([]);
  });

  test("unit関連mapが無いcwdではエラー（呼び出し側でfail-safeに倒す）", () => {
    expect(() => ciMappedUnitTests(["docs/a.md"], { cwd: tmpdirFixture() })).toThrow(
      "scripts/unit-related-map.json",
    );
  });
});

describe("runCiChangeScope", () => {
  const BASE = "b".repeat(40);
  const HEAD = "a".repeat(40);

  test(".mdのみの変更: code_changed=false でも mapped_tests を出力する", () => {
    const outputPath = path.join(tmpdirFixture(), "github-output.txt");
    const result = runCiChangeScope({
      baseSha: BASE,
      headSha: HEAD,
      cwd: repoRoot,
      githubOutput: outputPath,
      readChanged: () => ["AGENTS.md"],
    });

    expect(result.codeChanged).toBe(false);
    expect(result.reason).toBe("diff");
    expect(result.mappedTests).toEqual(["skills/skills.test.mjs"]);

    const output = readFileSync(outputPath, "utf8");
    expect(output).toContain("code_changed=false");
    expect(output).toContain("mapped_tests=skills/skills.test.mjs");
    expect(output).toContain("changed_count=1");
  });

  test("コード変更を含むdiffでは mapped_tests を計算するが code_changed=true", () => {
    const result = runCiChangeScope({
      baseSha: BASE,
      headSha: HEAD,
      cwd: repoRoot,
      readChanged: () => [".github/workflows/ci.yml"],
    });

    expect(result.codeChanged).toBe(true);
    // .github/workflows/ci.yml は個別エントリと **/*.yml の両方にマッチする
    expect(result.mappedTests).toEqual([
      "scripts/ci-change-scope.test.mjs",
      "skills/skills.test.mjs",
    ]);
  });

  test("unit関連mapが無い環境では code_changed=true に倒す", () => {
    const result = runCiChangeScope({
      baseSha: BASE,
      headSha: HEAD,
      cwd: tmpdirFixture(),
      readChanged: () => ["docs/a.md"],
    });

    expect(result.codeChanged).toBe(true);
    expect(result.reason).toBe("unit_map_failed");
    expect(result.mappedTests).toEqual([]);
  });

  test("unit関連mapが壊れている環境でも code_changed=true に倒す", () => {
    const dir = tmpdirFixture();
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    writeFileSync(
      path.join(dir, "scripts", "unit-related-map.json"),
      JSON.stringify({ "docs/*.md": "skills/skills.test.mjs" }),
    );
    const result = runCiChangeScope({
      baseSha: BASE,
      headSha: HEAD,
      cwd: dir,
      readChanged: () => ["docs/a.md"],
    });

    expect(result.codeChanged).toBe(true);
    expect(result.reason).toBe("unit_map_failed");
    expect(result.mappedTests).toEqual([]);
  });

  test("diff取得失敗・新規branchは従来どおり安全側", () => {
    const failed = runCiChangeScope({
      baseSha: BASE,
      headSha: HEAD,
      cwd: repoRoot,
      readChanged: () => {
        throw new Error("unreachable");
      },
    });
    expect(failed).toMatchObject({
      codeChanged: true,
      reason: "diff_failed",
      mappedTests: [],
    });

    const created = runCiChangeScope({
      baseSha: "0".repeat(40),
      headSha: HEAD,
      cwd: repoRoot,
      readChanged: () => {
        throw new Error("must not be called");
      },
    });
    expect(created).toMatchObject({
      codeChanged: true,
      reason: "branch_created",
      mappedTests: [],
    });
  });
});

describe("ci.yml", () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));

  test("workflow 単位の paths-ignore / paths は存在しない", () => {
    // YAML 1.1 では on が boolean true として解釈されることがある
    const on = workflow.on ?? workflow.true;
    expect(on).toBeTruthy();
    for (const event of Object.values(on)) {
      // workflow_dispatch のように値の無いイベントは filter 対象外
      if (event === null || typeof event !== "object") continue;
      expect(event).not.toHaveProperty("paths-ignore");
      expect(event).not.toHaveProperty("paths");
    }
  });

  test("scope が mapped_tests を出力し、dispatch では空にする", () => {
    const jobs = workflow.jobs;
    expect(jobs.scope.outputs.mapped_tests).toContain("mapped_tests");

    const dispatch = jobs.scope.steps.find((step) => step.id === "scope_dispatch");
    expect(dispatch.run).toContain('echo "mapped_tests="');
  });

  test("scope 以外の全ジョブが CI scope の判定で skip する（Testのみmap対象テストで実行）", () => {
    const jobs = workflow.jobs;
    expect(jobs.scope.name).toBe("CI scope");

    const guard =
      "${{ !cancelled() && (needs.scope.result != 'success' || needs.scope.outputs.code_changed == 'true') }}";
    // Test は .md のみの変更でも unit-related-map の対応テストを実行するため条件を広げる
    const testGuard =
      "${{ !cancelled() && (needs.scope.result != 'success' || needs.scope.outputs.code_changed == 'true' || needs.scope.outputs.mapped_tests != '') }}";
    // scope以外の全jobにガードを要求する（将来jobを追加したとき付け忘れを検出する）
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "scope") continue;
      expect(job.needs, `job ${name} lacks needs: scope`).toBe("scope");
      expect(job.if, `job ${name} lacks the scope guard`).toBe(name === "test" ? testGuard : guard);
    }
    // ジョブ名は required checks が参照するので変更しない
    expect(jobs.lint.name).toBe("Lint");
    expect(jobs.build.name).toBe("Build");
    expect(jobs.test.name).toBe("Test");
  });

  test("Testジョブは code変更時に全量、.mdのみのmap対象変更時に対応テストだけを実行する", () => {
    const steps = workflow.jobs.test.steps;
    const coverage = steps.find((step) => step.name === "Test and coverage");
    const mapped = steps.find((step) => step.name === "Mapped contract tests");

    expect(coverage.if).toBe(
      "${{ needs.scope.result != 'success' || needs.scope.outputs.code_changed == 'true' }}",
    );
    expect(coverage.run).toBe("pnpm run test:coverage");

    expect(mapped.if).toBe(
      "${{ needs.scope.result == 'success' && needs.scope.outputs.code_changed != 'true' && needs.scope.outputs.mapped_tests != '' }}",
    );
    expect(mapped.run).toContain("vitest run");
    expect(mapped.run).toContain("${{ needs.scope.outputs.mapped_tests }}");
    // 収集0件を成功にしない（文書契約テストが静かに抜けるのを防ぐ）
    expect(mapped.run).not.toContain("passWithNoTests");
  });
});
