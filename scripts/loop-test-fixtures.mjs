import { computeAssessment } from "./loop-policy.mjs";
import { resolveRuntime } from "./loop-runner.mjs";
export const agentAssessment = {
  risk_assessment: {
    blast_radius: "local",
    data_security: "none",
    reversibility: "easy",
    uncertainty: "known_pattern",
    floor_triggers: [],
  },
  tier_rationale: "Known scoped change",
  applied_tier: "T1",
};
export function taskFixture(root = process.cwd(), overrides = {}) {
  const task = {
    version: 2,
    taskId: "test-task",
    implementer: "author",
    state: "execute",
    head: "a".repeat(40),
    baseHead: "b".repeat(40),
    baseRef: "origin/preview",
    branch: "codex/task",
    risk: "T1",
    attempt: 0,
    spec: {
      goal: "Complete a test task",
      acceptanceCriteria: [{ id: "AC1", text: "Task works" }],
      nonGoals: [],
      assumptions: [],
      openMaterialDecisions: [],
      verificationStrategy: ["Run process tests"],
      predictedRisk: "T1",
    },
    // Legacy profile fields (selection/profileSource/profile) are kept on
    // purpose: old state blocks still carry them and must keep validating.
    configuration: {
      runtime: resolveRuntime({ runtime: "codex", root }),
      profileSource: "standard.yaml",
      profile: { name: "standard", autonomy: "high", verification: "proportional" },
      selection: {
        selected: "standard",
        source: "auto",
        ruleVersion: 1,
        inputs: {
          blast_radius: "several_surfaces",
          uncertainty: "known_pattern",
          verification_load: "routine",
        },
        auto: "standard",
        matched: "standard",
        reasons: ["no higher-intensity rule matched"],
        evaluatedAt: "2026-01-01T00:00:00.000Z",
        head: "a".repeat(40),
        state: "refine",
        trigger: "refine_ready",
        revisions: [],
      },
    },
    agentAssessment: structuredClone(agentAssessment),
    skills: [],
    verification: {},
    counters: { review: 0, ci: 0, sameFailure: 0 },
    history: [],
    ...overrides,
  };
  task.assessment = computeAssessment(task, ["README.md"]);
  task.verification.process = { head: task.head, baseHead: task.baseHead, success: true };
  return task;
}
export function verificationManifestFixture(task, kind = "process", overrides = {}) {
  return {
    run: {
      head: task.head,
      baseHead: task.baseHead,
      checkedAt: "2026-01-01T00:10:00.000Z",
      durationMs: 1234,
    },
    appliesTo: {
      head: task.head,
      baseHead: task.baseHead,
    },
    success: true,
    commands: [["node", "scripts/check-loop-docs.mjs"]],
    summary: { exitCode: 0, lastLines: ["Tests 136 passed"] },
    artifact: {
      path: `/nonexistent/agent-evidence/${task.taskId}/${kind}-1.log`,
      sha256: "b".repeat(64),
      bytes: 1024,
    },
    ...overrides,
  };
}
export function reviewFixture(task, overrides = {}) {
  return {
    head: task.head,
    baseHead: task.baseHead,
    reviewer: "reviewer",
    independent: true,
    context: "fresh",
    evidence: ["Reviewed all changed branches"],
    findings: [],
    acceptanceCriteria: [{ id: "AC1", evidence: "Regression test passes" }],
    assessment: structuredClone(agentAssessment),
    ...overrides,
  };
}
