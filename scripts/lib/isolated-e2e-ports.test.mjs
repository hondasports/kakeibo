import { describe, expect, it } from "vitest";
import {
  E2E_PORT_ENV_VARS,
  e2ePortChecks,
  e2ePortEnv,
  hasCustomE2EPorts,
  resolveE2EPorts,
} from "./isolated-e2e-ports.ts";

describe("isolated E2E ports", () => {
  it("preserves defaults and permits a partial override", () => {
    expect(resolveE2EPorts({})).toEqual({ vite: 5173, convexCloud: 3210, convexSite: 3211 });
    expect(hasCustomE2EPorts({})).toBe(false);
    expect(resolveE2EPorts({ E2E_VITE_PORT: "15173" })).toEqual({
      vite: 15173,
      convexCloud: 3210,
      convexSite: 3211,
    });
    expect(hasCustomE2EPorts({ E2E_VITE_PORT: "15173" })).toBe(true);
  });

  it("uses the same selected values for preflight and child environment", () => {
    const env = {
      E2E_VITE_PORT: "15173",
      E2E_CONVEX_CLOUD_PORT: "13210",
      E2E_CONVEX_SITE_PORT: "13211",
    };
    const ports = resolveE2EPorts(env);
    expect(e2ePortChecks(ports).map(({ port }) => port)).toEqual([15173, 13210, 13211]);
    expect(e2ePortEnv(ports)).toEqual(env);
  });

  it("accepts the valid port range boundaries", () => {
    expect(resolveE2EPorts({ E2E_VITE_PORT: "1", E2E_CONVEX_SITE_PORT: "65535" })).toEqual({
      vite: 1,
      convexCloud: 3210,
      convexSite: 65535,
    });
  });

  for (const name of E2E_PORT_ENV_VARS) {
    it.each(["", "0", "-1", "65536", "1.5", "1e4", " 15173", "15173;invalid"])(
      `rejects invalid ${name} (%s)`,
      (value) => {
        expect(() => resolveE2EPorts({ [name]: value })).toThrow(name);
      },
    );
  }

  it.each([
    { E2E_VITE_PORT: "3210" },
    { E2E_VITE_PORT: "3211" },
    { E2E_CONVEX_CLOUD_PORT: "3211" },
  ])("rejects conflicting service ports", (env) => {
    expect(() => resolveE2EPorts(env)).toThrow("異なるポート");
  });
});
