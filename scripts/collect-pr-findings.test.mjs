import { describe, expect, it } from "vitest";

import { toFindings } from "./collect-pr-findings.mjs";

function thread(overrides = {}) {
  return {
    id: "PRRT_t1",
    isResolved: false,
    isOutdated: false,
    path: "src/App.tsx",
    line: 42,
    comments: {
      nodes: [
        {
          author: { login: "coderabbit" },
          body: "この null check は不要では?",
          url: "https://github.com/o/r/pull/1#c1",
          createdAt: "2026-01-02T00:00:00Z",
        },
      ],
    },
    ...overrides,
  };
}

describe("toFindings", () => {
  it("assigns stable ids to unresolved threads ordered by first comment time", () => {
    const older = thread({
      id: "t_old",
      comments: {
        nodes: [
          { author: { login: "devin" }, body: "a", url: "u1", createdAt: "2026-01-01T00:00:00Z" },
        ],
      },
    });
    const newer = thread({ id: "t_new" });
    const result = toFindings([newer, older]);

    expect(result.unresolvedCount).toBe(2);
    expect(result.findings[0].id).toBe("f1");
    expect(result.findings[0].threadId).toBe("t_old");
    expect(result.findings[1].id).toBe("f2");
    expect(result.findings[1].threadId).toBe("t_new");
  });

  it("counts resolved and outdated threads separately", () => {
    const result = toFindings([
      thread({ id: "t1", isResolved: true }),
      thread({ id: "t2", isOutdated: true }),
      thread({ id: "t3" }),
    ]);

    expect(result.resolvedCount).toBe(1);
    expect(result.outdatedCount).toBe(1);
    expect(result.unresolvedCount).toBe(2);
    expect(result.findings.map((f) => f.threadId)).toEqual(["t2", "t3"]);
  });

  it("handles threads without comments", () => {
    const result = toFindings([thread({ id: "t1", comments: { nodes: [] } })]);
    expect(result.findings[0]).toMatchObject({ id: "f1", author: null, body: "", commentCount: 0 });
  });

  it("truncates long bodies", () => {
    const longBody = "x".repeat(2000);
    const result = toFindings([
      thread({
        id: "t1",
        comments: {
          nodes: [
            { author: { login: "a" }, body: longBody, url: "u", createdAt: "2026-01-01T00:00:00Z" },
          ],
        },
      }),
    ]);
    expect(result.findings[0].body).toHaveLength(1000);
  });
});
