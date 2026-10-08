// #952: T2/T3のREVIEW cleanは現在HEADのCI checkを正本とする。
// AC1: T3コードタスクでローカル証跡なしにCI成功でclean可
// AC2: check失敗→clean不可（verdict failure、呼出側はci_reproduce）
// AC3: 別HEADのcheckは合否に数えない（head_mismatch）
// AC4: Agent harnessはREVIEW clean対象外・E2Eはruntime_relevantのみ
// AC7: .md-only T3がSKIPPED合格でclean
// AC8: .md以外でのSKIPPED→ci_unexpected_skip相当
import { describe, expect, it } from "vitest";
import {
  evaluateReviewCi,
  expectedReviewCiChecks,
  requireReviewCiEvidence,
  requiresReviewCi,
} from "./loop-policy.mjs";
import { transitionTask } from "./loop-runner.mjs";
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
