// #952: T2/T3のREVIEW cleanは現在HEADのCI checkを正本とする。
// AC1: T3コードタスクでローカル証跡なしにCI成功でclean可
// AC2: check失敗→clean不可（verdict failure、呼出側はci_reproduce）
// AC3: 別HEADのcheckは合否に数えない（head_mismatch）
// AC4: Agent harnessはREVIEW clean対象外・E2Eはruntime_relevantのみ
// AC7: .md-only T3がSKIPPED合格でclean
// AC8: .md以外でのSKIPPED→ci_unexpected_skip相当
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeAssessment,
  evaluateReviewCi,
  expectedReviewCiChecks,
  requireReviewCiEvidence,
  requiresReviewCi,
} from "./loop-policy.mjs";
import { loadTask, runNext, saveTask, transitionTask } from "./loop-runner.mjs";
import { taskFixture, reviewFixture, agentAssessment } from "./loop-test-fixtures.mjs";

const t3Task = () => {
  const task = taskFixture();
  task.risk = "T3";
  task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T3" };
  return task;
};
const rollup = (conclusions = {}, names = ["Agent harness", "CI scope", "Lint", "Build", "Test"]) =>
  names.map((name) => ({
    name,
    status: "COMPLETED",
    conclusion: conclusions[name] ?? "SUCCESS",
  }));
const pr = (task, checks, overrides = {}) => ({
  headRefOid: task.head,
  baseRefOid: task.baseHead,
  statusCheckRollup: checks,
  ...overrides,
});

describe("expectedReviewCiChecks", () => {
  it("AC4: excludes Agent harness; E2E names appear only when runtime relevant", () => {
    const task = t3Task();
    const names = expectedReviewCiChecks(["src/app.ts"], task.assessment).map((c) => c.name);
    expect(names).not.toContain("Agent harness");
    expect(names).not.toContain("E2E (Playwright / Chromium / authenticated)");
    task.assessment.verification = { ...task.assessment.verification, e2e: true };
    const withE2e = expectedReviewCiChecks(["convex/http.ts"], task.assessment).map((c) => c.name);
    expect(withE2e).toContain("E2E (Playwright / Chromium / authenticated)");
    expect(withE2e).not.toContain("Agent harness");
  });
});

describe("evaluateReviewCi", () => {
  it("AC1: T3 code task — success on the current HEAD evaluates ok", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(pr(task, rollup()), task, ["src/app.ts"]);
    expect(outcome.verdict).toBe("ok");
    expect(outcome.observed.every((c) => c.state === "accepted")).toBe(true);
  });
  it("AC2: a failing required check → failure (caller must request reproduction)", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(pr(task, rollup({ Test: "FAILURE" })), task, ["src/app.ts"]);
    expect(outcome.verdict).toBe("failure");
    expect(outcome.failed).toEqual(["Test"]);
  });
  it("AC3: checks for another HEAD never count", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(pr(task, rollup(), { headRefOid: "c".repeat(40) }), task, [
      "src/app.ts",
    ]);
    expect(outcome.verdict).toBe("head_mismatch");
  });
  it("AC3: checks for another base HEAD never count", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(pr(task, rollup(), { baseRefOid: "d".repeat(40) }), task, [
      "src/app.ts",
    ]);
    expect(outcome.verdict).toBe("head_mismatch");
  });
  it("pending / unobserved checks → pending", () => {
    const task = t3Task();
    const checks = rollup();
    checks[2] = { name: "Lint", status: "IN_PROGRESS", conclusion: "" };
    const outcome = evaluateReviewCi(pr(task, checks), task, ["src/app.ts"]);
    expect(outcome.verdict).toBe("pending");
    expect(outcome.pending).toContain("Lint");
    const missing = evaluateReviewCi(
      pr(
        task,
        rollup({}).filter((c) => c.name !== "Test"),
      ),
      task,
      ["src/app.ts"],
    );
    expect(missing.verdict).toBe("pending");
  });
  it("AC7: .md-only accepts SKIPPED for Lint/Build/Test", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(
      pr(task, rollup({ Lint: "SKIPPED", Build: "SKIPPED", Test: "SKIPPED" })),
      task,
      ["README.md", "docs/x.md"],
    );
    expect(outcome.verdict).toBe("ok");
  });
  it("AC8: non-.md diff with SKIPPED required check → unexpected_skip", () => {
    const task = t3Task();
    const outcome = evaluateReviewCi(pr(task, rollup({ Lint: "SKIPPED" })), task, ["src/app.ts"]);
    expect(outcome.verdict).toBe("unexpected_skip");
    expect(outcome.skipped).toEqual(["Lint"]);
  });
  it("failure outranks a still-pending check", () => {
    const task = t3Task();
    const checks = rollup({ Lint: "FAILURE" });
    checks[4] = { name: "Test", status: "IN_PROGRESS", conclusion: "" };
    const outcome = evaluateReviewCi(pr(task, checks), task, ["src/app.ts"]);
    expect(outcome.verdict).toBe("failure");
  });
});

describe("requiresReviewCi / requireReviewCiEvidence", () => {
  it("T1 does not require CI review evidence; T2/T3 do", () => {
    expect(requiresReviewCi(taskFixture())).toBe(false);
    const t2 = taskFixture();
    t2.risk = "T2";
    expect(requiresReviewCi(t2)).toBe(true);
    expect(requiresReviewCi(t3Task())).toBe(true);
  });
  it("accepts only current-HEAD ok evidence", () => {
    const task = t3Task();
    expect(() => requireReviewCiEvidence(task)).toThrow(/CI review evidence/);
    task.reviewCi = { ok: true, head: task.head, baseHead: "e".repeat(40) };
    expect(() => requireReviewCiEvidence(task)).toThrow(/CI review evidence/);
    task.reviewCi = { ok: true, head: task.head, baseHead: task.baseHead };
    expect(() => requireReviewCiEvidence(task)).not.toThrow();
  });
});

describe("REVIEW clean gate", () => {
  const gate = (task, root = process.cwd()) => {
    task.state = "review";
    task.review = reviewFixture(task);
    task.findings = [];
    return () => transitionTask(task, "clean", {}, root);
  };
  it("AC1: T3 cleans on recorded CI evidence without local unit evidence", () => {
    const task = t3Task();
    expect(task.verification.unit).toBeUndefined();
    task.reviewCi = { ok: true, head: task.head, baseHead: task.baseHead };
    gate(task)();
    expect(task.state).toBe("aftercare");
  });
  it("AC2: no recorded CI evidence → clean rejected", () => {
    const task = t3Task();
    expect(gate(task)).toThrow(/CI review evidence/);
  });
  it("AC7: .md-only T3 with recorded SKIPPED-accepted evidence cleans", () => {
    const task = t3Task();
    task.reviewCi = {
      ok: true,
      head: task.head,
      baseHead: task.baseHead,
      checks: evaluateReviewCi(
        pr(task, rollup({ Lint: "SKIPPED", Build: "SKIPPED", Test: "SKIPPED" })),
        task,
        ["README.md"],
      ).observed,
    };
    gate(task)();
    expect(task.state).toBe("aftercare");
  });
  it("T1 cleans without CI review evidence (lite behavior preserved)", () => {
    const task = taskFixture();
    gate(task)();
    expect(task.state).toBe("aftercare");
  });
});

// F6: --next --review のCI配線（poll→verdict→証跡記録/停止語）の結合テスト。
// evaluate/gate単体では配線バグ（ok以外での証跡記録、停止語の誤配線、
// pollの非終了）を捕まえられないため、runNextをstub servicesで駆動する。
const FULL_CHECKS = [
  "Agent harness",
  "CI scope",
  "Lint",
  "Build",
  "Test",
  "E2E (Playwright / Chromium / public)",
  "E2E (Playwright / Chromium / authenticated)",
];
const wiringRepo = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-ci-wiring-"));
  // resolveRuntime（taskFixture）とprocessConfig（transition）が .agent を要求する
  cpSync(path.join(process.cwd(), ".agent"), path.join(dir, ".agent"), { recursive: true });
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "preview"]);
  git(["config", "user.email", "test@example.invalid"]);
  git(["config", "user.name", "Test"]);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src/app.ts"), "export const app = true;\n");
  git(["add", "."]);
  git(["-c", "core.hooksPath=/dev/null", "commit", "-m", "base"]);
  const baseHead = git(["rev-parse", "HEAD"]).trim();
  git(["switch", "-c", "task/x"]);
  writeFileSync(path.join(dir, "src/feature.ts"), "export const feature = true;\n");
  git(["add", "."]);
  git(["-c", "core.hooksPath=/dev/null", "commit", "-m", "change"]);
  const head = git(["rev-parse", "HEAD"]).trim();
  const task = taskFixture(dir, { head, baseHead, baseRef: "preview", branch: "task/x" });
  task.state = "review";
  task.risk = "T3";
  task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T3" };
  task.assessment = computeAssessment(task, ["src/feature.ts"], dir);
  task.aftercare = { pr: 7 };
  saveTask(task, dir);
  return { dir, git, task };
};
const reviewFileFor = (task) => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "review-file-")), "review.json");
  writeFileSync(file, JSON.stringify(reviewFixture(task)), { mode: 0o600 });
  return file;
};
const wiringServices = (fetchPr, extra = {}) => ({
  runVerification: (task) => task,
  fetchPr,
  sleep: () => {},
  ...extra,
});

describe("runNext --review CI wiring", () => {
  it("ok verdict → reviewCi recorded on this head → clean → aftercare", () => {
    const { dir, task } = wiringRepo();
    const result = runNext(
      { review: reviewFileFor(task) },
      dir,
      wiringServices(() => pr(task, rollup({}, FULL_CHECKS))),
    );
    expect(result.needs).toBe("aftercare");
    const saved = loadTask(dir);
    expect(saved.state).toBe("aftercare");
    expect(saved.reviewCi?.ok).toBe(true);
    expect(saved.reviewCi.head).toBe(task.head);
    expect(saved.reviewCi.baseHead).toBe(task.baseHead);
  });
  it("failure verdict → ci_reproduce, unresolved record deduped on retry, reviewCi untouched", () => {
    const { dir, task } = wiringRepo();
    const failing = pr(task, rollup({ Test: "FAILURE" }, FULL_CHECKS));
    const services = wiringServices(() => failing, {
      gh: (argv) =>
        argv.join(" ").includes("/logs")
          ? "log line"
          : JSON.stringify({
              check_runs: [
                {
                  name: "Test",
                  conclusion: "FAILURE",
                  html_url: "https://github.com/o/r/actions/runs/1/job/2",
                },
              ],
            }),
      resolveRepo: () => "o/r",
    });
    const result = runNext({ review: reviewFileFor(task) }, dir, services);
    expect(result.needs).toBe("ci_reproduce");
    expect(result.command).toContain("--event ci_failure");
    let saved = loadTask(dir);
    expect(saved.state).toBe("review");
    expect(saved.reviewCi ?? null).toBeNull();
    expect(saved.ciFailures.filter((f) => f.check === "Test" && !f.resolvedAt)).toHaveLength(1);
    // Same check failing again must not grow the unresolved list.
    const again = runNext({ review: reviewFileFor(task) }, dir, services);
    expect(again.needs).toBe("ci_reproduce");
    saved = loadTask(dir);
    expect(saved.ciFailures.filter((f) => f.check === "Test" && !f.resolvedAt)).toHaveLength(1);
  });
  it("unexpected_skip verdict → ci_unexpected_skip, no reviewCi", () => {
    const { dir, task } = wiringRepo();
    const result = runNext(
      { review: reviewFileFor(task) },
      dir,
      wiringServices(() => pr(task, rollup({ Lint: "SKIPPED" }, FULL_CHECKS))),
    );
    expect(result.needs).toBe("ci_unexpected_skip");
    expect(loadTask(dir).reviewCi ?? null).toBeNull();
  });
  it("pending → polls until ok → reviewCi recorded (poll terminates)", () => {
    const { dir, task } = wiringRepo();
    let calls = 0;
    let now = 0;
    const fetchPr = () => {
      calls += 1;
      const checks = rollup({}, FULL_CHECKS);
      if (calls === 1) {
        const test = checks.find((c) => c.name === "Test");
        test.status = "IN_PROGRESS";
        test.conclusion = null;
      }
      return pr(task, checks);
    };
    const result = runNext(
      { review: reviewFileFor(task) },
      dir,
      wiringServices(fetchPr, { tick: () => (now += 1000), maxSeconds: 3600 }),
    );
    expect(calls).toBe(2);
    expect(result.needs).toBe("aftercare");
    expect(loadTask(dir).reviewCi?.ok).toBe(true);
  });
  it("permanent pending → ci_pending after the poll budget", () => {
    const { dir, task } = wiringRepo();
    const checks = rollup({}, FULL_CHECKS);
    checks.find((c) => c.name === "Test").status = "IN_PROGRESS";
    checks.find((c) => c.name === "Test").conclusion = null;
    let now = 0;
    const result = runNext(
      { review: reviewFileFor(task) },
      dir,
      wiringServices(() => pr(task, checks), { tick: () => (now += 1000), maxSeconds: 60 }),
    );
    expect(result.needs).toBe("ci_pending");
    expect(loadTask(dir).reviewCi ?? null).toBeNull();
  });
  it("F3: review → --event ci_failure keeps the #958 contract (execute, counter, dedup)", () => {
    const { dir, task } = wiringRepo();
    const exit = {
      reason: "CI failed",
      ciFailure: {
        check: "Test",
        head: task.head,
        runUrl: "https://github.com/o/r/actions/runs/1",
        artifactUrl: "https://github.com/o/r/actions/runs/1/artifacts/2",
        failedTests: [{ file: "e2e/x.spec.ts", title: "fails" }],
        reproduce: "pnpm run e2e:isolated -- e2e/x.spec.ts",
      },
      reproduction: {
        command: "pnpm run e2e:isolated -- e2e/x.spec.ts",
        result: "reproduced",
        note: "same failure",
      },
    };
    const moved = transitionTask(task, "ci_failure", exit, dir);
    expect(moved.state).toBe("execute");
    expect(moved.counters.ci).toBe(1);
    expect(moved.ciFailures).toHaveLength(1);
    expect(moved.ciFailures[0].reproduction?.result).toBe("reproduced");
    // Contract enforcement: no reproduction → rejected
    expect(() =>
      transitionTask(
        wiringRepo().task,
        "ci_failure",
        { reason: "x", ciFailure: exit.ciFailure },
        dir,
      ),
    ).toThrow(/reproduction/);
    // not_reproduced → incident (no repair guessing)
    const second = wiringRepo().task;
    const incident = transitionTask(
      second,
      "ci_failure",
      { ...exit, reproduction: { command: "c", result: "not_reproduced", note: "env-only" } },
      dir,
    );
    expect(incident.state).toBe("incident");
  });
});
