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
