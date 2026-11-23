import { describe, expect, it } from "vitest";
import { CI_MAX_FAILURES, resolveE2ECiLimits } from "./e2e-ci-limits.ts";

describe("resolveE2ECiLimits", () => {
  it("CIでなければmaxFailuresもglobalTimeoutも設定しない", () => {
    expect(resolveE2ECiLimits({})).toEqual({});
    expect(resolveE2ECiLimits({ E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual({});
    expect(resolveE2ECiLimits({ CI: "", E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual({});
  });

  it("CIではmaxFailuresを設定し、env未指定ならglobalTimeoutは設定しない", () => {
    expect(resolveE2ECiLimits({ CI: "true" })).toEqual({ maxFailures: CI_MAX_FAILURES });
    expect(CI_MAX_FAILURES).toBe(10);
  });

  it("CIでE2E_GLOBAL_TIMEOUT_MSが正の整数ならglobalTimeoutに入る", () => {
    expect(resolveE2ECiLimits({ CI: "true", E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual({
      maxFailures: 10,
      globalTimeout: 360000,
    });
  });

  it("E2E_GLOBAL_TIMEOUT_MSが不正値ならエラーにする", () => {
    for (const value of ["abc", "0", "-1", "1.5", "10m", " "]) {
      expect(() => resolveE2ECiLimits({ CI: "true", E2E_GLOBAL_TIMEOUT_MS: value }), value).toThrow(
        "E2E_GLOBAL_TIMEOUT_MS",
      );
    }
  });

  it("CIでなければ不正値でもエラーにしない（ローカル挙動を変えない）", () => {
    expect(resolveE2ECiLimits({ E2E_GLOBAL_TIMEOUT_MS: "abc" })).toEqual({});
  });
});
