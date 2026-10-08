import { describe, expect, it } from "vitest";
import { checkPullRequest, validateCheckpoint } from "./loop-pr-check.mjs";
import { checkAftercare, computeAssessment, selectChecks } from "./loop-policy.mjs";
import { stateBlock } from "./loop-runner.mjs";
import { taskFixture, reviewFixture } from "./loop-test-fixtures.mjs";
function readyTask() {
  const task = taskFixture(process.cwd(), { state: "aftercare" });
  task.review = reviewFixture(task);
  return task;
}
const requiredRollup = () =>
  ["Agent harness", "CI scope", "Lint", "Build", "Test"].map((name) => ({
    name,
    status: "COMPLETED",
    conclusion: "SUCCESS",
  }));
function prFixture(task) {
  return {
    number: 1,
    state: "OPEN",
    isDraft: false,
    headRefOid: task.head,
    baseRefOid: task.baseHead,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    statusCheckRollup: requiredRollup(),
  };
}
const findings = { pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 };
describe("GitHub delivery gates", () => {
  it("accepts SKIPPED Lint/Build/Test only when the harness confirms .md-only paths", () => {
    const task = readyTask();
    const pr = prFixture(task);
    for (const check of pr.statusCheckRollup)
      if (["Lint", "Build", "Test"].includes(check.name)) check.conclusion = "SKIPPED";
    // md-only diff: SKIPPED counts as a pass for the application CI jobs.
    expect(checkAftercare(pr, task, findings, ["README.md"]).ready).toBe(true);
    // A single code path flips acceptance back to SUCCESS-only (AC2).
    expect(() => checkAftercare(pr, task, findings, ["src/app.ts"])).toThrow("Required check");
    // An empty/unknown path list fails closed — SKIPPED is never accepted.
    expect(() => checkAftercare(pr, task, findings)).toThrow("Required check");
  });
  it("recomputes floors from actual changed paths instead of trusting a PR snapshot", () => {
    const task = readyTask();
    // Content-target paths make the assessment read the diff; "HEAD" keeps it
    // resolvable in shallow checkouts where origin/preview is absent.
    task.baseRef = "HEAD";
    const context = { head: task.head, baseHead: task.baseHead, paths: ["README.md"] };
    expect(validateCheckpoint(task, context).risk.final).toBe("T1");
    expect(() => validateCheckpoint(task, { ...context, paths: ["convex/schema.ts"] })).toThrow(
      "risk",
    );
    task.risk = "T3";
    expect(() => validateCheckpoint(task, { ...context, paths: ["convex/schema.ts"] })).toThrow(
      "skill",
    );
    expect(() => validateCheckpoint(task, { ...context, head: "changed" })).toThrow("HEAD/base");
  });
  it("accepts state blocks with or without legacy profile fields", () => {
    const task = readyTask();
    const context = { head: task.head, baseHead: task.baseHead, paths: ["README.md"] };
    // Fixture keeps legacy selection/profileSource/profile keys — still valid.
    expect(() => validateCheckpoint(task, context)).not.toThrow();
    // New tasks record none of them — also valid.
    delete task.configuration.selection;
    delete task.configuration.profile;
    delete task.configuration.profileSource;
    expect(() => validateCheckpoint(task, context)).not.toThrow();
  });
  it("requires state for non-bot PRs even when only markdown changes", () => {
    const task = readyTask();
    const event = {
      pull_request: {
        user: { login: "person", type: "User" },
        head: { sha: task.head, ref: task.branch },
        base: { sha: task.baseHead },
        body: "",
      },
    };
    expect(() => checkPullRequest(event, { readPaths: () => ["README.md"] })).toThrow(
      "state block",
    );
    event.pull_request.body = stateBlock(task);
    expect(checkPullRequest(event, { readPaths: () => ["README.md"] }).risk.final).toBe("T1");
    event.pull_request.user = { login: "dependabot[bot]", type: "Bot" };
    event.pull_request.body = "";
    expect(checkPullRequest(event).skipped).toBe("automation account");
  });
  it("accepts the compact published block, including a delta review reference", () => {
    const task = readyTask();
    const reviewedHead = "c".repeat(40);
    task.history = Array.from({ length: 40 }, (_, index) => ({
      state: "execute",
      event: "assessed",
      head: index.toString(16).padStart(40, "0"),
    }));
    task.history[2] = { state: "review", event: "review_recorded", head: reviewedHead };
    task.review = reviewFixture(task, { deltaFrom: reviewedHead });
    const event = {
      pull_request: {
        user: { login: "person", type: "User" },
        head: { sha: task.head, ref: task.branch },
        base: { sha: task.baseHead },
        body: `Human Request\n\n${stateBlock(task)}`,
      },
    };
    expect(event.pull_request.body.length).toBeLessThan(JSON.stringify(task, null, 2).length);
    expect(checkPullRequest(event, { readPaths: () => ["README.md"] }).risk.final).toBe("T1");
  });
  it("requires full-scope unit evidence at the PR checkpoint", () => {
    const task = readyTask();
    task.baseRef = "HEAD";
    // Standard lane only: T1 lite tasks carry no local evidence requirement,
    // so exercise the gate on a task that stays standard (T3).
    task.agentAssessment.applied_tier = "T3";
    task.risk = "T3";
    const paths = ["src/app.ts"];
    const assessment = computeAssessment(task, paths);
    expect(assessment.verification.unit).toBe(true);
    task.skills = [...assessment.requiredSkills];
    for (const kind of ["process", "lint", "unit", "build"])
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    const context = { head: task.head, baseHead: task.baseHead, paths };
    expect(() => validateCheckpoint(task, context)).not.toThrow();
    task.verification.unit.run = { scope: "affected" };
    expect(() => validateCheckpoint(task, context)).toThrow("Full unit verification");
    // A run record without an explicit full scope never counts as full.
    task.verification.unit.run = {};
    expect(() => validateCheckpoint(task, context)).toThrow("Full unit verification");
    task.verification.unit.run = { scope: "full" };
    expect(() => validateCheckpoint(task, context)).not.toThrow();
  });
  it("rejects pending checks, stale HEAD, missing required checks, and unhandled findings", () => {
    const task = readyTask();
    const pr = prFixture(task);
    expect(checkAftercare(pr, task, findings).ready).toBe(true);
    expect(() => checkAftercare({ ...pr, headRefOid: "stale" }, task, findings)).toThrow("changed");
    expect(() => checkAftercare({ ...pr, statusCheckRollup: [] }, task, findings)).toThrow("No CI");
    expect(() =>
      checkAftercare(
        {
          ...pr,
          statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS", conclusion: "" }],
        },
        task,
        findings,
      ),
    ).toThrow("pending");
    expect(() => checkAftercare(pr, task, { ...findings, unhandledCount: 1 })).toThrow("Unhandled");
    expect(() =>
      checkAftercare({ ...pr, reviewDecision: "REVIEW_REQUIRED" }, task, findings),
    ).toThrow("approval");
    task.baseRef = "HEAD";
    task.assessment = computeAssessment(task, ["src/app.ts"]);
    // Any required check missing keeps the gate closed.
    expect(() =>
      checkAftercare(
        { ...pr, statusCheckRollup: pr.statusCheckRollup.filter((c) => c.name !== "Lint") },
        task,
        findings,
        ["src/app.ts"],
      ),
    ).toThrow("Required check");
  });
  it("evaluates only the latest run per check name when a check was retried", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "failure",
        completedAt: "2026-10-03T02:00:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        completedAt: "2026-10-03T02:10:00Z",
      },
    ];
    expect(checkAftercare(pr, task, findings).ready).toBe(true);
    pr.statusCheckRollup[2] = {
      name: "E2E (Playwright / Chromium / authenticated)",
      status: "COMPLETED",
      conclusion: "failure",
      completedAt: "2026-10-03T02:20:00Z",
    };
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful");
  });
  it("never hides an unorderable check behind a dated success (fail-closed)", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        completedAt: "2026-10-03T02:00:00Z",
      },
      // Undated failure: cannot be ordered, must still be evaluated.
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "failure",
      },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful");
    // Nameless/contextless entries are also always evaluated.
    pr.statusCheckRollup[2] = { status: "IN_PROGRESS", conclusion: "" };
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful or pending");
    // A newer pending retry of a dated success also stays visible.
    pr.statusCheckRollup[2] = {
      name: "E2E (Playwright / Chromium / authenticated)",
      status: "IN_PROGRESS",
      conclusion: "",
      startedAt: "2026-10-03T02:30:00Z",
    };
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
  });
  it("does not let an older run's completion time hide a newer pending run", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        // Long-running attempt: finished after the newer attempt started.
        startedAt: "2026-10-03T02:00:00Z",
        completedAt: "2026-10-03T02:30:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "IN_PROGRESS",
        conclusion: "",
        startedAt: "2026-10-03T02:20:00Z",
      },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
    // Same ordering via a QUEUED entry dated only by createdAt.
    pr.statusCheckRollup[2] = {
      name: "E2E (Playwright / Chromium / authenticated)",
      status: "QUEUED",
      conclusion: "",
      createdAt: "2026-10-03T02:20:00Z",
    };
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
  });
  it("cannot supersede a pending run with a completion-only completed run", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        completedAt: "2026-10-03T02:30:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "QUEUED",
        conclusion: "",
        createdAt: "2026-10-03T02:20:00Z",
      },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
  });
  it("lets a newer completed run supersede a stale pending run", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "IN_PROGRESS",
        conclusion: "",
        // Stale ghost from an older attempt; the retry started strictly later.
        startedAt: "2026-10-03T02:00:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-10-03T02:10:00Z",
        completedAt: "2026-10-03T02:20:00Z",
      },
    ];
    expect(checkAftercare(pr, task, findings).ready).toBe(true);
  });
  it("does not let a completion-only success outrank a start-dated failure", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "failure",
        startedAt: "2026-10-03T02:00:00Z",
        completedAt: "2026-10-03T02:30:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        // No start info: cannot be ordered against start-keyed runs, so it is
        // always evaluated rather than silently outranking the failure.
        completedAt: "2026-10-03T02:15:00Z",
      },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful");
  });
  it("prefers the non-successful run when timestamps tie", () => {
    const task = readyTask();
    const pr = prFixture(task);
    const failure = {
      name: "E2E (Playwright / Chromium / authenticated)",
      status: "COMPLETED",
      conclusion: "failure",
      startedAt: "2026-10-03T02:00:00Z",
    };
    const success = {
      name: "E2E (Playwright / Chromium / authenticated)",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      startedAt: "2026-10-03T02:00:00Z",
    };
    pr.statusCheckRollup = [...requiredRollup(), failure, success];
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful");
    pr.statusCheckRollup[1] = success;
    pr.statusCheckRollup[2] = failure;
    expect(() => checkAftercare(pr, task, findings)).toThrow("Unsuccessful");
  });
  it("lets a newer completed StatusContext supersede a stale pending one", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      { context: "ci/context-check", state: "PENDING", createdAt: "2026-10-03T02:00:00Z" },
      { context: "ci/context-check", state: "SUCCESS", createdAt: "2026-10-03T02:10:00Z" },
    ];
    expect(checkAftercare(pr, task, findings).ready).toBe(true);
  });
  it("evaluates each pending run that no newer-started run supersedes", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "IN_PROGRESS",
        conclusion: "",
        startedAt: "2026-10-03T02:00:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-10-03T02:10:00Z",
        completedAt: "2026-10-03T02:15:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "QUEUED",
        conclusion: "",
        createdAt: "2026-10-03T02:20:00Z",
      },
    ];
    // The 02:00 pending is superseded by the 02:10 run; the 02:20 QUEUED run is not.
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
    const selected = selectChecks(pr.statusCheckRollup);
    expect(selected.filter((check) => check.status === "IN_PROGRESS")).toHaveLength(0);
    expect(selected.filter((check) => check.status === "QUEUED")).toHaveLength(1);
  });
  it("keeps pending StatusContext entries visible next to dated successes", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      { context: "ci/context-check", state: "SUCCESS", createdAt: "2026-10-03T02:00:00Z" },
      { context: "ci/context-check", state: "PENDING", createdAt: "2026-10-03T02:10:00Z" },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
  });
  it("keeps a named pending run visible when it carries no timestamp", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      ...requiredRollup(),
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        completedAt: "2026-10-03T02:00:00Z",
      },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        status: "QUEUED",
        conclusion: "",
      },
    ];
    expect(() => checkAftercare(pr, task, findings)).toThrow("pending");
  });
  it("preserves a reviewer's higher risk and enforces independence", () => {
    const task = readyTask();
    task.baseRef = "HEAD";
    task.review.assessment.applied_tier = "T3";
    expect(computeAssessment(task, ["README.md"]).risk.final).toBe("T3");
    task.risk = "T3";
    // T3 requires thorough verification; legacy-shaped evidence counts as full.
    for (const kind of ["lint", "unit", "build"])
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    task.review.independent = false;
    expect(() =>
      validateCheckpoint(task, { head: task.head, baseHead: task.baseHead, paths: ["README.md"] }),
    ).toThrow("Independent");
  });
});
