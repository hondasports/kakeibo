import { describe, expect, it } from "vitest";
import { flakyFromJsonReport } from "./flaky-e2e.mjs";

describe("flakyFromJsonReport", () => {
  it("extracts passed-on-retry specs from playwright JSON report", () => {
    const report = {
      suites: [
        {
          suites: [
            {
              specs: [
                {
                  file: "e2e/a.spec.ts",
                  title: "flaky one",
                  tests: [
                    { status: "flaky", results: [{ status: "failed" }, { status: "passed" }] },
                  ],
                },
                {
                  file: "e2e/b.spec.ts",
                  title: "clean pass",
                  tests: [{ status: "expected", results: [{ status: "passed" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(flakyFromJsonReport(report)).toEqual([{ file: "e2e/a.spec.ts", title: "flaky one" }]);
  });
});
