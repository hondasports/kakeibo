import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessReviewDepth,
  REVIEW_AXES,
  REVIEW_FLOOR_TRIGGERS,
  REVIEW_REQUIREMENTS,
  REVIEW_TIERS,
  reviewRequirements,
  reviewTierFloor,
  run,
  validateAssessment,
} from "./review-depth.mjs";

const baseInput = {
  risk_assessment: {
    blast_radius: "local",
    data_security: "none",
    reversibility: "easy",
    uncertainty: "known_pattern",
    floor_triggers: [],
  },
  tier_rationale: "minimal change",
};

describe("review tier floor", () => {
  it("floors at T2 for a middle axis value and T3 for extremes or triggers", () => {
    expect(reviewTierFloor(baseInput.risk_assessment)).toBe("T1");
    expect(reviewTierFloor({ ...baseInput.risk_assessment, uncertainty: "some_unknowns" })).toBe(
      "T2",
    );
    for (const risk of [
      { ...baseInput.risk_assessment, blast_radius: "shared_or_system_wide" },
      { ...baseInput.risk_assessment, data_security: "direct_boundary_change" },
      { ...baseInput.risk_assessment, reversibility: "difficult_or_stateful" },
      { ...baseInput.risk_assessment, uncertainty: "novel_or_impact_unclear" },
    ]) {
      expect(reviewTierFloor(risk)).toBe("T3");
    }
  });

  it.each(REVIEW_FLOOR_TRIGGERS)("forces T3 for %s", (trigger) => {
    expect(reviewTierFloor({ ...baseInput.risk_assessment, floor_triggers: [trigger] })).toBe("T3");
  });
});

describe("assessment validation", () => {
  it("accepts a minimal valid assessment and rejects malformed input", () => {
    expect(validateAssessment(baseInput)).toEqual([]);
    for (const missing of ["risk_assessment", "tier_rationale"]) {
      const broken = { ...baseInput };
      delete broken[missing];
      expect(validateAssessment(broken).length).toBeGreaterThan(0);
    }
    expect(
      validateAssessment({
        ...baseInput,
        risk_assessment: { ...baseInput.risk_assessment, blast_radius: "huge" },
      }),
    ).toContain(
      "risk_assessment.blast_radius must be one of local/several_surfaces/shared_or_system_wide",
    );
    expect(
      validateAssessment({
        ...baseInput,
        risk_assessment: { ...baseInput.risk_assessment, floor_triggers: ["invented"] },
      }),
    ).toContain("risk_assessment.floor_triggers entries must match documented vocabulary");
    expect(validateAssessment({ ...baseInput, applied_tier: "T9" })).toContain(
      "applied_tier must be one of T1/T2/T3",
    );
  });

  it("rejects an applied tier below the computed floor and allows deeper", () => {
    const someUnknowns = {
      ...baseInput,
      risk_assessment: { ...baseInput.risk_assessment, uncertainty: "some_unknowns" },
    };
    expect(
      validateAssessment({ ...someUnknowns, applied_tier: "T1" }).some((e) =>
        e.includes("below the T2 floor"),
      ),
    ).toBe(true);
    expect(validateAssessment({ ...someUnknowns, applied_tier: "T2" })).toEqual([]);
    const triggered = {
      ...baseInput,
      risk_assessment: {
        ...baseInput.risk_assessment,
        floor_triggers: ["schema_or_migration"],
      },
    };
    expect(() => assessReviewDepth({ ...triggered, applied_tier: "T2" })).toThrow(
      "below the T3 floor",
    );
    expect(validateAssessment({ ...triggered, applied_tier: "T3" })).toEqual([]);
  });
});

describe("depth calculation output", () => {
  it("discloses cumulative requirements for the applied tier", () => {
    expect(assessReviewDepth(baseInput)).toMatchObject({
      minimum_tier: "T1",
      applied_tier: "T1",
      requirements: REVIEW_REQUIREMENTS.T1,
    });
    const triggered = assessReviewDepth({
      ...baseInput,
      risk_assessment: {
        ...baseInput.risk_assessment,
        floor_triggers: ["schema_or_migration"],
      },
    });
    expect(triggered.minimum_tier).toBe("T3");
    expect(triggered.requirements).toEqual(Object.values(REVIEW_REQUIREMENTS).flat());
    expect(assessReviewDepth({ ...baseInput, applied_tier: "T3" }).applied_tier).toBe("T3");
    expect(reviewRequirements("T2")).toEqual([
      ...REVIEW_REQUIREMENTS.T1,
      ...REVIEW_REQUIREMENTS.T2,
    ]);
  });
});

describe("stateless CLI", () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("discloses vocabulary and usage without input", () => {
    expect(run(["--vocabulary"])).toEqual({
      axes: REVIEW_AXES,
      floor_triggers: REVIEW_FLOOR_TRIGGERS,
      tiers: REVIEW_TIERS,
    });
    expect(run([]).usage).toContain("risk_assessment");
    expect(run(["--help"]).usage).toContain("risk_assessment");
  });

  it("accepts inline JSON or a file path and rejects extras", () => {
    const inline = run([JSON.stringify(baseInput)]);
    expect(inline.applied_tier).toBe("T1");
    const dir = mkdtempSync(path.join(tmpdir(), "review-depth-"));
    dirs.push(dir);
    const file = path.join(dir, "assessment.json");
    writeFileSync(file, JSON.stringify(baseInput));
    expect(run([file])).toEqual(inline);
    expect(() => run([JSON.stringify(baseInput), "extra"])).toThrow("extra arguments");
    expect(() => run(["not-json"])).toThrow();
    expect(() => run([JSON.stringify({ ...baseInput, tier_rationale: "" })])).toThrow(
      "tier_rationale is required",
    );
  });
});
