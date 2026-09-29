import { describe, expect, it } from "vitest";
import { assessChange } from "./assess-change.mjs";

describe("assessChange", () => {
  it("does not allow agent assessment to lower the machine floor", () => {
    const result = assessChange({
      paths: ["convex/schema.ts"], predictedRisk: "T1",
      agentAssessment: {
        risk_assessment: { blast_radius: "local", data_security: "none", reversibility: "easy", uncertainty: "known_pattern", floor_triggers: [] },
        tier_rationale: "local change",
      },
    });
    expect(result.risk.final).toBe("T3");
    expect(result.review.independent).toBe(true);
  });
});
