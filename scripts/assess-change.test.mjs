import { describe, expect, it } from "vitest";

import { assessChange, parseArguments } from "./assess-change.mjs";

describe("assessChange", () => {
  it("does not allow agent assessment to lower the machine floor", () => {
    const result = assessChange({
      paths: ["convex/schema.ts"],
      predictedRisk: "T1",
      agentAssessment: {
        risk_assessment: {
          blast_radius: "local",
          data_security: "none",
          reversibility: "easy",
          uncertainty: "known_pattern",
          floor_triggers: [],
        },
        tier_rationale: "local change",
      },
    });

    expect(result.risk.final).toBe("T3");
    expect(result.review.independent).toBe(true);
  });

  it("requires independent review when T2 has no agent assessment", () => {
    const result = assessChange({
      paths: ["src/features/foo/Foo.tsx"],
      predictedRisk: "T2",
    });

    expect(result.risk.final).toBe("T2");
    expect(result.review.independent).toBe(true);
  });

  it("routes hunks into the machine floor and marks their source", () => {
    const result = assessChange({
      paths: ["convex/categories/mutations.ts"],
      hunks: {
        "convex/categories/mutations.ts": ["const u = await ctx.auth.getUserIdentity();"],
      },
      predictedRisk: "T1",
    });
    expect(result.risk.machine).toBe("T3");
    expect(result.risk.final).toBe("T3");
    expect(result.risk.machineFloorTriggers).toContain("authentication_or_authorization");
    expect(result.risk.machineFloorTriggerDetails).toContainEqual({
      trigger: "authentication_or_authorization",
      source: "content",
      path: "convex/categories/mutations.ts",
    });
    expect(result.requiredSkills).toContain("security-review");
  });

  it("fails closed to T3 when the diff could not be read", () => {
    const result = assessChange({
      paths: ["src/features/foo/Foo.tsx"],
      diffFailed: true,
      predictedRisk: "T1",
    });
    expect(result.risk.machine).toBe("T3");
    expect(result.risk.machineFloorTriggers).toContain("diff_read_failed");
  });

  it.each([
    ["applied_tier T3 alone", { predictedRisk: "T3" }],
    [
      "uncertainty some_unknowns",
      {
        predictedRisk: "T1",
        agentAssessment: {
          risk_assessment: {
            blast_radius: "local",
            data_security: "none",
            reversibility: "easy",
            uncertainty: "some_unknowns",
            floor_triggers: [],
          },
          tier_rationale: "partially unknown",
        },
      },
    ],
    [
      "blast_radius shared_or_system_wide",
      {
        predictedRisk: "T1",
        agentAssessment: {
          risk_assessment: {
            blast_radius: "shared_or_system_wide",
            data_security: "none",
            reversibility: "easy",
            uncertainty: "known_pattern",
            floor_triggers: [],
          },
          tier_rationale: "system-wide surface",
        },
      },
    ],
  ])("thorough triggers lint/unit/build on non-runtime paths (%s)", (_label, input) => {
    const result = assessChange({ paths: ["docs/agent-harness.md"], ...input });
    expect(result.thorough).toBe(true);
    expect(result.verification).toEqual({
      process: true,
      lint: true,
      unit: true,
      build: true,
      e2e: false,
    });
  });

  it("keeps e2e tied to runtimeRelevant even under thorough", () => {
    const result = assessChange({
      paths: ["src/features/foo/Foo.tsx"],
      predictedRisk: "T1",
      agentAssessment: {
        risk_assessment: {
          blast_radius: "local",
          data_security: "none",
          reversibility: "easy",
          uncertainty: "some_unknowns",
          floor_triggers: [],
        },
        tier_rationale: "unknowns on a runtime path",
      },
    });
    expect(result.thorough).toBe(true);
    expect(result.verification.e2e).toBe(true);
  });

  it("keeps the minimal verification set for T1 known_pattern local (former fast)", () => {
    const result = assessChange({
      paths: ["docs/agent-harness.md"],
      predictedRisk: "T1",
      agentAssessment: {
        risk_assessment: {
          blast_radius: "local",
          data_security: "none",
          reversibility: "easy",
          uncertainty: "known_pattern",
          floor_triggers: [],
        },
        tier_rationale: "routine docs change",
      },
    });
    expect(result.thorough).toBe(false);
    expect(result.verification).toEqual({
      process: true,
      lint: false,
      unit: false,
      build: false,
      e2e: false,
    });
  });

  it("rejects missing CLI option values", () => {
    for (const option of ["--paths", "--predicted-risk", "--agent-assessment"]) {
      expect(() => parseArguments([option])).toThrow(`${option} requires a value`);
      expect(() => parseArguments([option, "--next-option"])).toThrow(`${option} requires a value`);
    }
    expect(parseArguments(["--", "--paths", "src/a.ts"])).toMatchObject({
      paths: ["src/a.ts"],
    });
  });
});
