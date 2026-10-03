import { describe, expect, it } from "vitest";
import { checkPullRequest, validateCheckpoint } from "./loop-pr-check.mjs";
import { checkAftercare, computeAssessment } from "./loop-policy.mjs";
import { stateBlock } from "./loop-runner.mjs";
import { taskFixture, reviewFixture } from "./loop-test-fixtures.mjs";
function readyTask() {
  const task = taskFixture(process.cwd(), { state: "aftercare" });
  task.review = reviewFixture(task);
  return task;
}
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
    statusCheckRollup: [{ name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" }],
  };
}
const findings = { pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 };
describe("GitHub delivery gates", () => {
  it("does not require skipped application CI for profile-only local verification increases", () => {
    const task = readyTask();
    task.configuration.profile.verification = "thorough";
    task.assessment = computeAssessment(task, ["README.md"]);
    expect(task.assessment.verification.build).toBe(true);
    expect(checkAftercare(prFixture(task), task, findings).ready).toBe(true);
  });
  it("recomputes floors from actual changed paths instead of trusting a PR snapshot", () => {
    const task = readyTask();
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
  it("rejects states without a decided profile selection", () => {
    const task = readyTask();
    const context = { head: task.head, baseHead: task.baseHead, paths: ["README.md"] };
    delete task.configuration.selection;
    expect(() => validateCheckpoint(task, context)).toThrow("selection");
    task.configuration.selection = {
      selected: "standard",
      source: "provisional",
      ruleVersion: 1,
    };
    expect(() => validateCheckpoint(task, context)).toThrow("Profile decision");
    task.configuration.selection = {
      selected: "deep",
      source: "auto",
      ruleVersion: 1,
      inputs: {},
    };
    expect(() => validateCheckpoint(task, context)).toThrow("Profile decision");
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
    task.assessment = computeAssessment(task, ["src/app.ts"]);
    expect(() => checkAftercare(pr, task, findings)).toThrow("Required check");
  });
  it("evaluates only the latest run per check name when a check was retried", () => {
    const task = readyTask();
    const pr = prFixture(task);
    pr.statusCheckRollup = [
      { name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" },
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
  it("preserves a reviewer's higher risk and enforces independence", () => {
    const task = readyTask();
    task.review.assessment.applied_tier = "T3";
    expect(computeAssessment(task, ["README.md"]).risk.final).toBe("T3");
    task.risk = "T3";
    task.review.independent = false;
    expect(() =>
      validateCheckpoint(task, { head: task.head, baseHead: task.baseHead, paths: ["README.md"] }),
    ).toThrow("Independent");
  });
});
