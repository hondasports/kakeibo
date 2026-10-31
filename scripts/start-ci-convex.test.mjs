import { describe, expect, it } from "vitest";

import { parseArgs } from "./start-ci-convex.mjs";

describe("parseArgs", () => {
  it("parses --run, --probe, --timeout and trailing args", () => {
    const args = parseArgs([
      "--run",
      "pnpm run e2e:smoke",
      "--probe",
      "--timeout",
      "90",
      "--",
      "e2e/auth.spec.ts",
    ]);
    expect(args.run).toBe("pnpm run e2e:smoke");
    expect(args.probe).toBe(true);
    expect(args.timeoutSec).toBe(90);
    expect(args.extraArgs).toEqual(["e2e/auth.spec.ts"]);
  });

  it("defaults to no run command and 120s timeout", () => {
    const args = parseArgs([]);
    expect(args.run).toBeNull();
    expect(args.probe).toBe(false);
    expect(args.timeoutSec).toBe(120);
    expect(args.extraArgs).toEqual([]);
  });

  it("rejects unknown args and invalid timeout", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("不明な引数");
    expect(() => parseArgs(["--timeout", "abc"])).toThrow("--timeout");
    expect(() => parseArgs(["--timeout", "-5"])).toThrow("--timeout");
  });
});
