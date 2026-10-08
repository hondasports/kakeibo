import { describe, expect, it } from "vitest";
import {
  checkKind,
  ciFlakyDiagnostics,
  extractCiFailures,
  failedCheckNames,
  flakyFromJsonReport,
  normalizeTestTitle,
  parseFailedTests,
  parseFlakyTests,
  parseJobUrl,
  reproduceCommand,
  validateReproduction,
} from "./ci-failure.mjs";

const E2E_AUTH = "E2E (Playwright / Chromium / authenticated)";
const E2E_PUB = "E2E (Playwright / Chromium / public)";

describe("checkKind / failedCheckNames", () => {
  it("classifies check names into kinds", () => {
    expect(checkKind(E2E_AUTH)).toBe("e2e");
    expect(checkKind("E2E / playwright")).toBe("e2e");
    expect(checkKind("Lint / lint")).toBe("lint");
    expect(checkKind("Build / build")).toBe("build");
    expect(checkKind("Test / test")).toBe("unit");
    expect(checkKind("Agent harness")).toBe("process");
  });
  it("keeps only failed status checks", () => {
    const rollup = [
      { name: "Lint / lint", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "Build / build", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: E2E_AUTH, status: "COMPLETED", conclusion: "FAILURE" },
      { name: E2E_PUB, status: "IN_PROGRESS" },
      { context: "Agent harness", state: "FAILURE" },
    ];
    expect(failedCheckNames(rollup)).toEqual(["Lint / lint", E2E_AUTH, "Agent harness"]);
  });
});

describe("parseJobUrl", () => {
  it("parses run/job ids from actions URLs", () => {
    expect(parseJobUrl("https://github.com/o/r/actions/runs/123/job/9")).toEqual({
      runId: "123",
      jobId: "9",
    });
    expect(parseJobUrl("https://github.com/o/r/actions/runs/123")).toEqual({
      runId: "123",
      jobId: undefined,
    });
    expect(parseJobUrl("https://github.com/o/r/pull/5")).toEqual({});
  });
});

describe("parseFailedTests / parseFlakyTests", () => {
  it("extracts playwright failures with public/authenticated project names", () => {
    const log = [
      "  1) [authenticated] › e2e/receipt.spec.ts:10:5 › fails hard",
      "  2) [public] › e2e/line.spec.ts:20:3 › also broken",
      "  ✘ [authenticated] › e2e/extra.spec.ts:1:1 › xmark",
      "  FAIL  src/a.test.ts > vitest fail",
      "  × fails 6ms",
    ].join("\n");
    expect(parseFailedTests(log)).toEqual([
      { file: "e2e/receipt.spec.ts", title: "fails hard" },
      { file: "e2e/line.spec.ts", title: "also broken" },
      { file: "e2e/extra.spec.ts", title: "xmark" },
      { file: "src/a.test.ts", title: "vitest fail" },
    ]);
  });
  it("strips gh api ISO timestamp prefixes on every log line", () => {
    const log = [
      "2026-10-07T23:06:34.7123456Z   ✘  2 [chromium] › e2e/receipt.spec.ts:10:5 › fails hard (5.2s)",
      "2026-10-07T23:06:35.0000000Z   1) [public] › e2e/line.spec.ts:20:3 › also broken ────────",
    ].join("\n");
    expect(parseFailedTests(log)).toEqual([
      { file: "e2e/receipt.spec.ts", title: "fails hard" },
      { file: "e2e/line.spec.ts", title: "also broken" },
    ]);
  });
  it("normalizes titles for playwright --grep (durations, padding, describe separators)", () => {
    expect(normalizeTestTitle("公開・異常系ページ › 未ログインでトップが開ける ────────")).toBe(
      "公開・異常系ページ 未ログインでトップが開ける",
    );
    expect(normalizeTestTitle("my suite › does x (12.3s)")).toBe("my suite does x");
    // describeの ` › ` は titlePath.join(' ') に合わせて空白へ
    expect(
      parseFailedTests("  1) [public] › e2e/foo.spec.ts:3:1 › suite › my title ───────────"),
    ).toEqual([{ file: "e2e/foo.spec.ts", title: "suite my title" }]);
  });
  it("extracts playwright flaky section entries", () => {
    const log = [
      "  2 flaky",
      "    [authenticated] › e2e/a.spec.ts:1:1 › t1",
      "    [public] › e2e/b.spec.ts:2:2 › t2",
      "  3 passed",
    ].join("\n");
    expect(parseFlakyTests(log)).toEqual([
      { file: "e2e/a.spec.ts", title: "t1" },
      { file: "e2e/b.spec.ts", title: "t2" },
    ]);
    expect(parseFlakyTests("no flaky section")).toEqual([]);
  });
  it("ignores in-run lines outside the flaky summary section (list reporter emits no ⚠)", () => {
    const log = [
      "  ✘ [public] › e2e/a.spec.ts:1:1 › not flaky, still failing (1.2s)",
      "  1 passed",
    ].join("\n");
    expect(parseFlakyTests(log)).toEqual([]);
  });
  it("strips timestamps in the flaky section too", () => {
    const log = [
      "2026-10-07T23:06:40.0Z   1 flaky",
      "2026-10-07T23:06:40.0Z     [public] › e2e/home.spec.ts:3:1 › wobble ──────",
      "2026-10-07T23:06:40.0Z   3 passed",
    ].join("\n");
    expect(parseFlakyTests(log)).toEqual([{ file: "e2e/home.spec.ts", title: "wobble" }]);
  });
});

describe("reproduceCommand", () => {
  it("builds per-test e2e commands joined by &&", () => {
    const cmd = reproduceCommand({
      checkName: E2E_AUTH,
      failedTests: [
        { file: "e2e/a.spec.ts", title: "fails hard" },
        { file: "e2e/b.spec.ts", title: 'says "hi"' },
      ],
    });
    expect(cmd).toBe(
      'pnpm run e2e:isolated -- e2e/a.spec.ts --grep "fails hard" && ' +
        'pnpm run e2e:isolated -- e2e/b.spec.ts --grep "says \\"hi\\""',
    );
  });
  it("falls back to job-level commands by kind", () => {
    expect(reproduceCommand({ checkName: E2E_AUTH, failedTests: [] })).toBe(
      "pnpm run e2e:isolated",
    );
    expect(reproduceCommand({ checkName: "Lint / lint", failedTests: [] })).toBe("pnpm run lint");
    expect(reproduceCommand({ checkName: "Build / build", failedTests: [] })).toBe(
      "pnpm run build",
    );
    expect(reproduceCommand({ checkName: "Test / unit", failedTests: [] })).toBe(
      "pnpm run test:coverage",
    );
    expect(reproduceCommand({ checkName: "Agent harness", failedTests: [] })).toBe(
      "pnpm run test:process",
    );
  });
  it("builds vitest per-test commands for unit checks", () => {
    expect(
      reproduceCommand({
        checkName: "Test / unit",
        failedTests: [{ file: "src/a.test.ts", title: "broken" }],
      }),
    ).toBe('pnpm exec vitest run src/a.test.ts -t "broken"');
  });
});

describe("extractCiFailures", () => {
  const fakeGh = (responses) => (args) => {
    const key = Object.keys(responses).find((k) => args.join(" ").includes(k));
    if (!key) throw new Error(`unmocked gh call: ${args.join(" ")}`);
    const v = responses[key];
    if (v instanceof Error) throw v;
    return v;
  };

  it("expands a failed e2e check into check/head/runUrl/artifact/failedTests/reproduce", () => {
    const records = extractCiFailures({
      rollup: [{ name: E2E_AUTH, status: "COMPLETED", conclusion: "FAILURE" }],
      head: "abc123",
      slug: "o/r",
      root: "/tmp",
      gh: fakeGh({
        "commits/abc123/check-runs": JSON.stringify({
          check_runs: [
            {
              name: E2E_AUTH,
              conclusion: "failure",
              html_url: "https://github.com/o/r/actions/runs/42/job/8",
            },
          ],
        }),
        "actions/runs/42/artifacts": JSON.stringify({
          artifacts: [{ name: "playwright-report-42-authenticated", id: 77 }],
        }),
        "actions/jobs/8/logs": "  1) [authenticated] › e2e/receipt.spec.ts:10:5 › fails hard\n",
      }),
    });
    const [rec] = records;
    expect(rec.check).toBe(E2E_AUTH);
    expect(rec.head).toBe("abc123");
    expect(rec.runUrl).toBe("https://github.com/o/r/actions/runs/42/job/8");
    expect(rec.artifactUrl).toBe("https://github.com/o/r/actions/runs/42/artifacts/77");
    expect(rec.failedTests).toEqual([{ file: "e2e/receipt.spec.ts", title: "fails hard" }]);
    expect(rec.reproduce).toBe('pnpm run e2e:isolated -- e2e/receipt.spec.ts --grep "fails hard"');
  });

  it("falls back gracefully when logs/artifacts fail", () => {
    const records = extractCiFailures({
      rollup: [{ name: "Lint / lint", status: "COMPLETED", conclusion: "FAILURE" }],
      head: "abc123",
      slug: "o/r",
      root: "/tmp",
      gh: fakeGh({
        "commits/abc123/check-runs": JSON.stringify({
          check_runs: [
            {
              name: "Lint / lint",
              conclusion: "failure",
              html_url: "https://github.com/o/r/actions/runs/42/job/7",
            },
          ],
        }),
        "actions/runs/42/artifacts": new Error("no artifacts"),
        "actions/jobs/7/logs": new Error("no log"),
      }),
    });
    expect(records[0].failedTests).toEqual([]);
    expect(records[0].artifactUrl).toBeNull();
    expect(records[0].reproduce).toBe("pnpm run lint");
  });
});

describe("validateReproduction", () => {
  it("requires command and a valid result", () => {
    expect(validateReproduction(null)).toEqual(["reproduction must be an object"]);
    expect(validateReproduction({ result: "reproduced" })).toEqual([
      "reproduction.command required",
    ]);
    expect(validateReproduction({ command: "x", result: "sometimes" })).toEqual([
      "reproduction.result must be reproduced|not_reproduced",
    ]);
    expect(validateReproduction({ command: "x", result: "not_reproduced" })).toEqual([]);
  });
});

describe("flakyFromJsonReport / ciFlakyDiagnostics", () => {
  it("extracts passed-on-retry specs from playwright JSON report", () => {
    const report = {
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  file: "e2e/a.spec.ts",
                  title: "flaky one",
                  tests: [
                    { status: "flaky", results: [{ status: "failed" }, { status: "passed" }] },
                  ],
                },
                {
                  file: "e2e/b.spec.ts",
                  title: "clean pass",
                  tests: [{ status: "expected", results: [{ status: "passed" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(flakyFromJsonReport(report)).toEqual([{ file: "e2e/a.spec.ts", title: "flaky one" }]);
  });

  it("collects flaky tests from e2e check job logs only", () => {
    const gh = (args) => {
      const joined = args.join(" ");
      if (joined.includes("check-runs"))
        return JSON.stringify({
          check_runs: [
            {
              name: E2E_PUB,
              conclusion: "success",
              html_url: "https://github.com/o/r/actions/runs/5/job/11",
            },
            {
              name: "Lint / lint",
              conclusion: "success",
              html_url: "https://github.com/o/r/actions/runs/5/job/10",
            },
          ],
        });
      if (joined.includes("jobs/11/logs"))
        return "  1 flaky\n    [public] › e2e/home.spec.ts:3:1 › wobble\n";
      throw new Error(`unmocked: ${joined}`);
    };
    const out = ciFlakyDiagnostics({
      rollup: [
        { name: E2E_PUB, status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "Lint / lint", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
      head: "abc123",
      slug: "o/r",
      root: "/tmp",
      gh,
    });
    expect(out).toEqual([{ check: E2E_PUB, file: "e2e/home.spec.ts", title: "wobble" }]);
  });
});
