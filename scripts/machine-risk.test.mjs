import { describe, expect, it } from "vitest";

import { machineRiskForPaths } from "./machine-risk.mjs";

describe("machineRiskForPaths", () => {
  it("forces T3 for schema changes", () => {
    expect(machineRiskForPaths(["convex/schema.ts"])).toMatchObject({
      minimumTier: "T3",
      floorTriggers: ["schema_or_migration"],
    });
  });

  it("keeps ordinary local changes at T1 machine floor", () => {
    expect(machineRiskForPaths(["src/features/foo/Foo.tsx"]).minimumTier).toBe("T1");
  });
});
