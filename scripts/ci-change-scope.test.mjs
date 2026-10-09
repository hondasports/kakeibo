import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

import { ciCodeChanged } from "./ci-change-scope.mjs";

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

  test("scope 以外の全ジョブが CI scope の判定で skip する", () => {
    const jobs = workflow.jobs;
    expect(jobs.scope.name).toBe("CI scope");

    const guard =
      "${{ !cancelled() && (needs.scope.result != 'success' || needs.scope.outputs.code_changed == 'true') }}";
    // scope以外の全jobにガードを要求する（将来jobを追加したとき付け忘れを検出する）
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "scope") continue;
      expect(job.needs, `job ${name} lacks needs: scope`).toBe("scope");
      expect(job.if, `job ${name} lacks the scope guard`).toBe(guard);
    }
    // ジョブ名は required checks が参照するので変更しない
    expect(jobs.lint.name).toBe("Lint");
    expect(jobs.build.name).toBe("Build");
    expect(jobs.test.name).toBe("Test");
  });
});
