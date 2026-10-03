import { describe, expect, it } from "vitest";

import {
  decideProfile,
  missingProfileInputs,
  parseArgs,
  profileInputs,
  resolveAgentProfile,
  selectProfile,
} from "./resolve-agent-profile.mjs";
import { agentAssessment, taskFixture } from "./loop-test-fixtures.mjs";

const routine = {
  blast_radius: "local",
  uncertainty: "known_pattern",
  verification_load: "routine",
};

function decidedTask(overrides = {}) {
  const task = taskFixture();
  task.agentAssessment = {
    ...structuredClone(agentAssessment),
    verification_load: { level: "routine", rationale: "process checks only" },
  };
  task.configuration.selection = {
    selected: "standard",
    source: "provisional",
    ruleVersion: 1,
    ...overrides,
  };
  return task;
}

describe("resolveAgentProfile", () => {
  it("resolves the provisional default without any model registry", () => {
    const result = resolveAgentProfile({ runtime: "codex" });
    expect(result.profileSource).toBe("standard.yaml");
    expect(result.profile.name).toBe("standard");
    expect(result.profile.effort).toBeUndefined();
    expect(result.selection).toMatchObject({ selected: "standard", source: "provisional" });
    expect(result.runtime.name).toBe("codex");
    expect(result).not.toHaveProperty("model");
    expect(result).not.toHaveProperty("effort");
  });

  it("records an explicit --profile as a user selection", () => {
    const result = resolveAgentProfile({ profile: "deep", runtime: "codex" });
    expect(result.profileSource).toBe("deep.yaml");
    expect(result.selection).toMatchObject({ selected: "deep", source: "user" });
  });

  it("rejects unknown task profiles and runtimes", () => {
    expect(() => resolveAgentProfile({ profile: "turbo" })).toThrow("unknown profile: turbo");
    expect(() => resolveAgentProfile({ runtime: "nowhere" })).toThrow("unknown runtime: nowhere");
  });

  it("keeps --model accepted but ignored for backward compatibility", () => {
    expect(parseArgs(["--model", "swe-2", "--runtime", "codex"])).toEqual({
      profile: null,
      runtime: "codex",
    });
    for (const option of ["--model", "--profile", "--runtime"]) {
      expect(() => parseArgs([option])).toThrow(`${option} requires a value`);
      expect(() => parseArgs([option, "--next-option"])).toThrow(`${option} requires a value`);
    }
    expect(() => parseArgs(["--unknown"])).toThrow("unknown option");
  });
});

describe("selectProfile", () => {
  it("applies the rule table top-down", () => {
    expect(
      selectProfile({
        blast_radius: "local",
        uncertainty: "novel_or_impact_unclear",
        verification_load: "routine",
      }).profile,
    ).toBe("max");
    for (const inputs of [
      { ...routine, uncertainty: "some_unknowns" },
      { ...routine, blast_radius: "shared_or_system_wide" },
      { ...routine, verification_load: "complex" },
    ]) {
      expect(selectProfile(inputs).profile).toBe("deep");
    }
    expect(selectProfile(routine).profile).toBe("fast");
    expect(selectProfile({ ...routine, blast_radius: "several_surfaces" }).profile).toBe(
      "standard",
    );
    expect(
      selectProfile({
        blast_radius: "local",
        uncertainty: "some_unknowns",
        verification_load: "complex",
      }).reasons,
    ).toEqual(["uncertainty=some_unknowns", "verification_load=complex"]);
  });

  it("rejects missing or invalid inputs instead of defaulting", () => {
    expect(() => selectProfile({})).toThrow("inputs missing");
    expect(() => selectProfile({ ...routine, uncertainty: "fuzzy" })).toThrow("inputs missing");
    expect(
      missingProfileInputs({ blast_radius: null, uncertainty: null, verification_load: null }),
    ).toHaveLength(3);
  });
});

describe("profileInputs", () => {
  it("reads axes and verification load from the agent assessment", () => {
    const assessment = {
      risk_assessment: { blast_radius: "several_surfaces", uncertainty: "some_unknowns" },
      verification_load: { level: "complex" },
    };
    expect(profileInputs(assessment)).toEqual({
      blast_radius: "several_surfaces",
      uncertainty: "some_unknowns",
      verification_load: "complex",
    });
    expect(
      profileInputs({ risk_assessment: assessment.risk_assessment }, { fallbackLoad: "routine" }),
    ).toEqual({
      blast_radius: "several_surfaces",
      uncertainty: "some_unknowns",
      verification_load: "routine",
    });
  });
});

describe("decideProfile", () => {
  it("replaces the provisional profile with the rule result and records the decision", () => {
    const task = decidedTask();
    const result = decideProfile(task);
    expect(result).toMatchObject({ decided: true, changed: true, selected: "fast" });
    expect(task.configuration.profile.name).toBe("fast");
    expect(task.configuration.profileSource).toBe("fast.yaml");
    const selection = task.configuration.selection;
    expect(selection).toMatchObject({
      selected: "fast",
      source: "auto",
      auto: "fast",
      matched: "fast",
      inputs: routine,
    });
    expect(selection.revisions).toHaveLength(1);
    expect(selection.revisions[0]).toMatchObject({ from: "standard", to: "fast" });
  });

  it("throws as a REFINE gap when strict and inputs are missing", () => {
    const task = decidedTask();
    task.agentAssessment = null;
    expect(() => decideProfile(task, { strict: true })).toThrow("REFINEの不足条件");
    expect(decideProfile(task).decided).toBe(false);
  });

  it("lets a user-specified profile win while recording the auto evaluation", () => {
    const task = decidedTask({ selected: "max", source: "user" });
    task.configuration.profile = { name: "max" };
    const result = decideProfile(task, { strict: true });
    expect(result.selected).toBe("max");
    expect(task.configuration.selection).toMatchObject({
      selected: "max",
      source: "user",
      auto: "fast",
      inputs: routine,
    });
    expect(task.configuration.selection.revisions).toHaveLength(0);
  });

  it("only re-determines upward for auto selections", () => {
    const task = decidedTask({
      selected: "deep",
      source: "auto",
      inputs: { ...routine, verification_load: "complex" },
    });
    task.configuration.profile = { name: "deep" };
    const result = decideProfile(task);
    expect(result.selected).toBe("deep");
    expect(task.configuration.selection.inputs).toEqual(routine);
    expect(task.configuration.selection.auto).toBe("fast");
    expect(task.configuration.selection.revisions).toHaveLength(0);
  });

  it("raises the profile when changed inputs select a higher level", () => {
    const task = decidedTask({ selected: "fast", source: "auto", inputs: routine });
    task.configuration.profile = { name: "fast" };
    task.agentAssessment.risk_assessment.uncertainty = "some_unknowns";
    const result = decideProfile(task, { trigger: "assessment" });
    expect(result).toMatchObject({ decided: true, changed: true, selected: "deep" });
    expect(task.configuration.profileSource).toBe("deep.yaml");
    const revision = task.configuration.selection.revisions.at(-1);
    expect(revision).toMatchObject({
      from: "fast",
      to: "deep",
      trigger: "assessment",
      reasons: ["uncertainty=some_unknowns"],
    });
  });

  it("skips re-evaluation when the recorded inputs did not change", () => {
    const task = decidedTask({ selected: "standard", source: "auto", inputs: routine });
    const result = decideProfile(task);
    expect(result).toMatchObject({ decided: false, unchanged: true, selected: "standard" });
    expect(task.configuration.profileSource).toBe("standard.yaml");
  });

  it("keeps the loaded profile as the floor when no decision record exists", () => {
    const task = taskFixture();
    delete task.configuration.selection;
    task.configuration.profile = { name: "deep" };
    task.agentAssessment = {
      ...structuredClone(agentAssessment),
      verification_load: { level: "routine", rationale: "process only" },
    };
    const result = decideProfile(task);
    expect(result).toMatchObject({ decided: true, selected: "deep" });
    expect(task.configuration.selection.source).toBe("auto");
    expect(task.configuration.selection.revisions).toHaveLength(0);
  });
});
