import { describe, expect, it } from "vitest";
import { resolveAgentProfile } from "./resolve-agent-profile.mjs";

describe("resolveAgentProfile", () => {
  it("uses exact known profile", () => {
    expect(resolveAgentProfile({ model: "gpt-6-sol" }).profileSource).toBe("gpt-6-sol.yaml");
  });
  it("falls back to safe default for unknown models", () => {
    const result = resolveAgentProfile({ model: "future-model-x" });
    expect(result.profileSource).toBe("default.yaml");
    expect(result.profile.name).toBe("safe-standard");
  });
});
