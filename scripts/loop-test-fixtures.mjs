import { resolveAgentProfile } from "./resolve-agent-profile.mjs";
import { computeAssessment } from "./loop-policy.mjs";
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
    configuration: {
      ...resolveAgentProfile({ runtime: "codex", root }),
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
