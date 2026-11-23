import { describe, expect, it } from "vitest";
import { buildChildEnv } from "./ci-convex-env-boundary.mjs";
import { CI_MAX_FAILURES, resolveE2ECiLimits } from "./e2e-ci-limits.ts";

describe("resolveE2ECiLimits", () => {
  it("GitHub ActionsでなければmaxFailuresもglobalTimeoutも設定しない", () => {
    expect(resolveE2ECiLimits({})).toEqual({});
    expect(resolveE2ECiLimits({ E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual({});
    expect(resolveE2ECiLimits({ GITHUB_ACTIONS: "", E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual({});
  });

  it("GitHub ActionsではmaxFailuresを設定し、env未指定ならglobalTimeoutは設定しない", () => {
    expect(resolveE2ECiLimits({ GITHUB_ACTIONS: "true" })).toEqual({
      maxFailures: CI_MAX_FAILURES,
    });
    expect(CI_MAX_FAILURES).toBe(10);
  });

  it("GitHub ActionsでE2E_GLOBAL_TIMEOUT_MSが正の整数ならglobalTimeoutに入る", () => {
    expect(resolveE2ECiLimits({ GITHUB_ACTIONS: "true", E2E_GLOBAL_TIMEOUT_MS: "360000" })).toEqual(
      {
        maxFailures: 10,
        globalTimeout: 360000,
      },
    );
  });

  it("E2E_GLOBAL_TIMEOUT_MSが不正値ならエラーにする", () => {
    for (const value of ["abc", "0", "-1", "1.5", "10m", " "]) {
      expect(
        () => resolveE2ECiLimits({ GITHUB_ACTIONS: "true", E2E_GLOBAL_TIMEOUT_MS: value }),
        value,
      ).toThrow("E2E_GLOBAL_TIMEOUT_MS");
    }
  });

  it("GitHub Actionsでなければ不正値でもエラーにしない（ローカル挙動を変えない）", () => {
    expect(resolveE2ECiLimits({ E2E_GLOBAL_TIMEOUT_MS: "abc" })).toEqual({});
  });

  it("CIだけ設定されたローカル相当のenv（e2e:isolatedのbuildChildEnv）では設定しない", () => {
    const localChildEnv = buildChildEnv({ E2E_GLOBAL_TIMEOUT_MS: "960000" });
    expect(localChildEnv.CI).toBe("true");
    expect(resolveE2ECiLimits(localChildEnv)).toEqual({});
  });

  it("GITHUB_ACTIONSがbuildChildEnvを通って子へ届けば設定される", () => {
    const childEnv = buildChildEnv({ GITHUB_ACTIONS: "true", E2E_GLOBAL_TIMEOUT_MS: "960000" });
    expect(resolveE2ECiLimits(childEnv)).toEqual({ maxFailures: 10, globalTimeout: 960000 });
  });
});
