// #949→#953: CI-is-verdict for every tier — local gating is process evidence
// plus the verify:prepush marker; Lint/Build/Test verdicts come from CI checks.
// AC1: .md-only task reaches DONE with Lint/Build/Test SKIPPED.
// AC2: non-.md task with SKIPPED/unobserved/pending/failed required check → not ready.
// AC5: still blocked on process evidence and harness/scope failures.
// AC6: no verify:prepush success marker for HEAD → execute ready rejected.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkAftercare,
  computeAssessment,
  expectedCiChecks,
  prepushMarkerPresent,
  requireLocalVerification,
  requiredVerificationKinds,
  verificationSummary,
} from "./loop-policy.mjs";
import { transitionTask } from "./loop-runner.mjs";
import { taskFixture, reviewFixture, agentAssessment } from "./loop-test-fixtures.mjs";

const root = process.cwd();
const dirs = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repository() {
  const dir = mkdtempSync(path.join(tmpdir(), "lite-lane-"));
  dirs.push(dir);
  cpSync(path.join(root, ".agent"), path.join(dir, ".agent"), { recursive: true });
  mkdirSync(path.join(dir, "scripts"));
  cpSync(
    path.join(root, "scripts/check-task-worktree.mjs"),
    path.join(dir, "scripts/check-task-worktree.mjs"),
  );
  writeFileSync(path.join(dir, "scripts/check-loop-docs.mjs"), "process.exit(0);\n");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ scripts: { "test:process": 'node -e "process.exit(0)"' } }),
  );
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\npnpm-lock.yaml\n");
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "preview");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  writeFileSync(path.join(dir, "README.md"), "first\n");
  git("add", ".");
  git("-c", "core.hooksPath=/dev/null", "commit", "-m", "base");
  git("switch", "-c", "codex/task");
  const head = git("rev-parse", "HEAD");
  const task = taskFixture(dir, { head, baseHead: head, baseRef: "preview" });
  return { dir, git, task };
}

const liteTask = () => taskFixture();
const rollup = (conclusions = {}) =>
  ["Agent harness", "CI scope", "Lint", "Build", "Test"].map((name) => ({
    name,
    status: "COMPLETED",
    conclusion: conclusions[name] ?? "SUCCESS",
  }));
const delivery = (task, checks) => ({
  number: 7,
  state: "OPEN",
  isDraft: false,
  headRefOid: task.head,
  baseRefOid: task.baseHead,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  statusCheckRollup: checks,
});
const findings = { pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 };

describe("expectedCiChecks", () => {
  it("always requires harness+scope and gates SKIPPED on a verified .md-only diff", () => {
    const task = liteTask();
    const md = expectedCiChecks(["README.md", "docs/x.md"], task.assessment);
    expect(md.map((c) => c.name)).toEqual(["Agent harness", "CI scope", "Lint", "Build", "Test"]);
    expect(md[0].accept).toEqual(["SUCCESS"]);
    expect(md[2].accept).toEqual(["SUCCESS", "SKIPPED"]);
    const code = expectedCiChecks(["src/app.ts"], task.assessment);
    expect(code[2].accept).toEqual(["SUCCESS"]);
    // Unreadable/empty diff → fail closed to SUCCESS-only.
    expect(expectedCiChecks([], task.assessment)[2].accept).toEqual(["SUCCESS"]);
    // E2E names appear only when the assessment requires e2e.
    const e2e = expectedCiChecks(["convex/http.ts"], { verification: { e2e: true } });
    expect(e2e.map((c) => c.name)).toContain("E2E (Playwright / Chromium / authenticated)");
    expect(e2e.map((c) => c.name)).not.toContain("Vercel");
  });
});

describe("checkAftercare", () => {
  it("AC1: .md-only T1 is ready with Lint/Build/Test SKIPPED", () => {
    const task = liteTask();
    task.review = reviewFixture(task);
    const pr = delivery(task, rollup({ Lint: "SKIPPED", Build: "SKIPPED", Test: "SKIPPED" }));
    expect(checkAftercare(pr, task, findings, ["README.md"]).ready).toBe(true);
  });
  it("AC2: a code path rejects SKIPPED/unobserved/pending/failed required checks", () => {
    const task = liteTask();
    task.review = reviewFixture(task);
    const paths = ["src/app.ts"];
    const skipped = delivery(task, rollup({ Lint: "SKIPPED", Build: "SKIPPED", Test: "SKIPPED" }));
    expect(() => checkAftercare(skipped, task, findings, paths)).toThrow("Required check");
    const missing = delivery(task, rollup());
    missing.statusCheckRollup = missing.statusCheckRollup.filter((c) => c.name !== "Test");
    expect(() => checkAftercare(missing, task, findings, paths)).toThrow("Required check");
    const pending = delivery(task, rollup());
    pending.statusCheckRollup[2].status = "IN_PROGRESS";
    pending.statusCheckRollup[2].conclusion = "";
    expect(() => checkAftercare(pending, task, findings, paths)).toThrow(/pending|Unsuccessful/);
    const failed = delivery(task, rollup({ Lint: "FAILURE" }));
    expect(() => checkAftercare(failed, task, findings, paths)).toThrow(/Unsuccessful|Required/);
  });
  it("AC5: still blocked on Agent harness / CI scope failures", () => {
    const task = liteTask();
    task.review = reviewFixture(task);
    for (const name of ["Agent harness", "CI scope"]) {
      const pr = delivery(task, rollup({ [name]: "FAILURE" }));
      expect(() => checkAftercare(pr, task, findings, ["README.md"])).toThrow(/Unsuccessful/);
    }
  });
  it("AC5: process evidence is still required", () => {
    const task = liteTask();
    delete task.verification.process;
    expect(() => requireLocalVerification(task)).toThrow(/process/i);
    expect(requiredVerificationKinds(task)).toEqual(["process"]);
  });
  it("shows CI-deferred kinds as ci, not missing (F-3)", () => {
    const task = liteTask();
    task.assessment.verification = {
      process: true,
      lint: true,
      unit: true,
      build: true,
      e2e: true,
    };
    delete task.verification.process;
    const summary = verificationSummary(task);
    expect(summary.lint).toBe("ci");
    expect(summary.unit).toBe("ci");
    expect(summary.build).toBe("ci");
    expect(summary.e2e).toBe("github");
    expect(summary.process).toBe("missing");
    // #952/#953: non-required kinds show as ci for every tier.
    const standard = taskFixture();
    standard.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T2" };
    standard.assessment = {
      ...standard.assessment,
      risk: { ...standard.assessment.risk, final: "T2" },
      verification: { process: true, lint: true, unit: true, build: true, e2e: true },
    };
    expect(verificationSummary(standard).lint).toBe("ci");
  });
});

describe("verify:prepush marker (AC6)", () => {
  it("rejects execute ready without the HEAD marker and accepts it with one", () => {
    const { dir, git, task } = repository();
    task.state = "execute";
    // A real README commit so the diff stays .md-only.
    writeFileSync(path.join(dir, "README.md"), "changed\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs");
    task.head = git("rev-parse", "HEAD");
    task.skills = [...task.assessment.requiredSkills];
    task.assessment = computeAssessment(task, ["README.md"], dir);
    task.agentAssessment = structuredClone(agentAssessment);
    task.verification.process = { head: task.head, baseHead: task.baseHead, success: true };
    expect(prepushMarkerPresent(task, dir)).toBe(false);
    expect(() => transitionTask(task, "ready", {}, dir)).toThrow(/verify:prepush/);
    const marker = path.resolve(
      dir,
      git("rev-parse", "--git-path", `agent-prepush/${task.head}.ok`),
    );
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, "ok\n");
    expect(prepushMarkerPresent(task, dir)).toBe(true);
    transitionTask(task, "ready", {}, dir);
    expect(task.state).toBe("review");
  });
  it("#952: T2/T3 also require the marker (prepush is the local gate for every tier)", () => {
    const { dir, git, task } = repository();
    task.state = "execute";
    task.risk = "T2";
    task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T2" };
    task.assessment = computeAssessment(task, ["README.md"], dir);
    task.skills = [...task.assessment.requiredSkills];
    for (const kind of requiredVerificationKinds(task))
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    expect(() => transitionTask(task, "ready", {}, dir)).toThrow(/verify:prepush/);
    const marker = path.resolve(
      dir,
      git("rev-parse", "--git-path", `agent-prepush/${task.head}.ok`),
    );
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, "ok\n");
    transitionTask(task, "ready", {}, dir);
    expect(task.state).toBe("review");
  });
});
