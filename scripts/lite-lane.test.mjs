// #949: Lite lane — T1 tasks defer local thorough verification to CI.
// AC1: .md-only T1 reaches DONE with Lint/Build/Test SKIPPED.
// AC2: non-.md T1 with SKIPPED/unobserved/pending/failed required check → not ready.
// AC3: any floor trigger or independent review → not lite.
// AC4: T2/T3 keep the standard lane (thorough local verification).
// AC5: lite lane still blocked on process evidence and harness/scope failures.
// AC6: no verify:prepush success marker for HEAD → execute ready rejected.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkAftercare,
  computeAssessment,
  expectedCiChecks,
  isLiteLane,
  prepushMarkerPresent,
  requireLocalVerification,
  requiredVerificationKinds,
} from "./loop-policy.mjs";
import { transitionTask } from "./loop-runner.mjs";
import { rmSync } from "node:fs";
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

const liteTask = () => {
  const task = taskFixture();
  expect(isLiteLane(task)).toBe(true);
  return task;
};
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

describe("isLiteLane", () => {
  it("is true for plain T1 and false for floor triggers / independent review / higher tiers", () => {
    expect(isLiteLane(taskFixture())).toBe(true);
    // AC3a: a machine floor trigger keeps the task off the lite lane even
    // when the computed final tier would otherwise read T1.
    const trigger = taskFixture();
    trigger.assessment.risk.machineFloorTriggers = [
      "complex_state_transition_or_orchestration_port",
    ];
    expect(isLiteLane(trigger)).toBe(false);
    // And a real floor-triggering path forces the tier up (never lite).
    const floored = taskFixture();
    floored.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T3" };
    floored.assessment = computeAssessment(floored, ["convex/schema.ts"]);
    expect(isLiteLane(floored)).toBe(false);
    // AC3b: an independent-review requirement keeps the task on the standard lane.
    const reviewed = taskFixture();
    reviewed.assessment = { ...reviewed.assessment, review: { independent: true } };
    expect(isLiteLane(reviewed)).toBe(false);
    // AC4: T2/T3 are never lite.
    for (const tier of ["T2", "T3"]) {
      const task = taskFixture();
      task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: tier };
      task.assessment = computeAssessment(task, ["README.md"]);
      expect(isLiteLane(task)).toBe(false);
    }
  });
});

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

describe("checkAftercare on the lite lane", () => {
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
  it("AC5: lite lane is still blocked on Agent harness / CI scope failures", () => {
    const task = liteTask();
    task.review = reviewFixture(task);
    for (const name of ["Agent harness", "CI scope"]) {
      const pr = delivery(task, rollup({ [name]: "FAILURE" }));
      expect(() => checkAftercare(pr, task, findings, ["README.md"])).toThrow(/Unsuccessful/);
    }
  });
  it("AC5: process evidence is still required on the lite lane", () => {
    const task = liteTask();
    delete task.verification.process;
    expect(() => requireLocalVerification(task)).toThrow(/process/i);
    expect(requiredVerificationKinds(task)).toEqual(["process"]);
  });
});

describe("verify:prepush marker (AC6)", () => {
  it("rejects execute ready without the HEAD marker and accepts it with one", () => {
    const { dir, git, task } = repository();
    task.state = "execute";
    // A real README commit so the diff stays .md-only and the task stays lite.
    writeFileSync(path.join(dir, "README.md"), "changed\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs");
    task.head = git("rev-parse", "HEAD");
    task.skills = [...task.assessment.requiredSkills];
    const lite = { ...task, assessment: computeAssessment(task, ["README.md"], dir) };
    expect(isLiteLane(lite)).toBe(true);
    task.assessment = lite.assessment;
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
  it("standard lane tasks do not need the marker", () => {
    const { dir, task } = repository();
    task.state = "execute";
    task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T2" };
    task.assessment = computeAssessment(task, ["README.md"], dir);
    task.skills = [...task.assessment.requiredSkills];
    for (const kind of requiredVerificationKinds(task))
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    expect(isLiteLane(task)).toBe(false);
    expect(() => transitionTask(task, "ready", {}, dir)).not.toThrow(/verify:prepush/);
  });
});
