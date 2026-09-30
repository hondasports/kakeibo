import { describe, expect, it } from "vitest";

import { parseArgs, resolveAgentProfile } from "./resolve-agent-profile.mjs";

describe("resolveAgentProfile", () => {
  it("uses the model-recommended common profile for GPT-6.1 Sol", () => {
    const result = resolveAgentProfile({ model: "gpt-6.1-sol" });
    expect(result.modelSource).toBe("gpt-6.1-sol.yaml");
    expect(result.profileSource).toBe("standard.yaml");
    expect(result.effort.resolved).toBe("medium");
  });

  it("uses an explicit task profile independently of the model", () => {
    const result = resolveAgentProfile({ model: "swe-2", profile: "deep" });
    expect(result.modelSource).toBe("swe-2.yaml");
    expect(result.profileSource).toBe("deep.yaml");
    expect(result.effort.resolved).toBe("high");
  });

  it("maps unsupported low effort to SWE-2 medium", () => {
    const result = resolveAgentProfile({ model: "swe-2", profile: "fast" });
    expect(result.profile.effort).toBe("low");
    expect(result.effort.resolved).toBe("medium");
  });

  it("falls back to standard profile and neutral model config for unknown models", () => {
    const result = resolveAgentProfile({ model: "future-model-x" });
    expect(result.modelSource).toBe("default.yaml");
    expect(result.profileSource).toBe("standard.yaml");
    expect(result.profile.name).toBe("standard");
    expect(result.effort.resolved).toBeNull();
  });

  it("rejects unknown task profiles", () => {
    expect(() => resolveAgentProfile({ model: "gpt-6.1-sol", profile: "turbo" })).toThrow(
      "unknown profile: turbo",
    );
  });

  it("rejects missing CLI option values", () => {
    for (const option of ["--model", "--profile", "--runtime"]) {
      expect(() => parseArgs([option])).toThrow(`${option} requires a value`);
      expect(() => parseArgs([option, "--next-option"])).toThrow(`${option} requires a value`);
    }
  });
});
