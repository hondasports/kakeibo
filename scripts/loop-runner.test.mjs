import { describe, expect, it } from "vitest";

import { resolveLoopStep } from "./loop-runner.mjs";

describe("resolveLoopStep", () => {
  it("resolves an allowed state transition", () => {
    const result = resolveLoopStep({
      state: "refine",
      event: "ready",
      model: "gpt-6-sol",
      runtime: "codex",
    });
    expect(result.nextState).toBe("execute");
  });

  it("rejects undefined transitions", () => {
    expect(() =>
      resolveLoopStep({ state: "refine", event: "clean", model: "gpt-6-sol" }),
    ).toThrow();
  });

  it("rejects review clean without validated exit evidence", () => {
    expect(() => resolveLoopStep({ state: "review", event: "clean", model: "gpt-6-sol" })).toThrow(
      "review clean requires exit evidence",
    );

    expect(() =>
      resolveLoopStep({
        state: "review",
        event: "clean",
        model: "gpt-6-sol",
        exit: {
          state: "review",
          event: "clean",
          openFindings: 1,
          evidence: ["reviewed current diff"],
        },
      }),
    ).toThrow("review clean requires openFindings=0");
  });

  it("allows review clean only with zero findings and evidence", () => {
    const result = resolveLoopStep({
      state: "review",
      event: "clean",
      model: "gpt-6-sol",
      exit: {
        state: "review",
        event: "clean",
        openFindings: 0,
        evidence: ["reviewed current diff"],
      },
    });

    expect(result.nextState).toBe("aftercare");
  });
});
