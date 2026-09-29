import { describe, expect, it } from "vitest";
import { resolveLoopStep } from "./loop-runner.mjs";

describe("resolveLoopStep", () => {
  it("resolves an allowed state transition", () => {
    const result = resolveLoopStep({ state: "refine", event: "ready", model: "gpt-6-sol", runtime: "codex" });
    expect(result.nextState).toBe("execute");
  });
  it("rejects undefined transitions", () => {
    expect(() => resolveLoopStep({ state: "refine", event: "clean", model: "gpt-6-sol" })).toThrow();
  });
});
