import { describe, expect, it } from "vitest";
import { getLineLinkFeedback } from "./feedback";
import { resolveLineIntegrationMode } from "./integrationMode";

it("内部理由を有限な公開feedbackへ写像する", () => {
  expect(getLineLinkFeedback("SUCCESS")).toEqual({ result: "success", code: "success" });
  expect(getLineLinkFeedback("STATE_EXPIRED")).toEqual({ result: "failure", code: "expired" });
  expect(getLineLinkFeedback("LINE_LINK_CONFLICT")).toEqual({
    result: "failure",
    code: "conflict",
  });
  expect(getLineLinkFeedback("INVALID_NONCE")).toEqual({ result: "failure", code: "invalid" });
  expect(getLineLinkFeedback("private detail")).toEqual({ result: "failure", code: "failed" });
});

describe("resolveLineIntegrationMode", () => {
  it("mockとrealだけを許可する", () => {
    expect(resolveLineIntegrationMode("mock", "development")).toBe("mock");
    expect(resolveLineIntegrationMode("real", "production")).toBe("real");
    expect(() => resolveLineIntegrationMode(undefined, "development")).toThrow();
  });

  it("productionのmockを拒否する", () => {
    expect(() => resolveLineIntegrationMode("mock", "production")).toThrow();
  });
});
