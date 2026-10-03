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
