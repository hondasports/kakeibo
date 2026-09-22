import { describe, expect, it } from "vitest";

import { fetchConnectionPages, toFindings } from "./collect-pr-findings.mjs";

function thread(overrides = {}) {
  return {
    id: "PRRT_t1",
    isResolved: false,
    isOutdated: false,
    path: "src/App.tsx",
    line: 42,
    comments: {
      pageInfo: { hasNextPage: false },
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

describe("fetchConnectionPages", () => {
  function connectionPage(nodes, { hasNextPage = false, endCursor = null } = {}) {
    return {
      repository: {
        pullRequest: {
          number: 1,
          reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes },
        },
      },
    };
  }

  it("collects nodes across all pages so a 101st unresolved thread is found", () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      thread({ id: `t_res_${i}`, isResolved: true }),
    );
    const page2 = [thread({ id: "t_unresolved_101" })];
    const pages = [
      connectionPage(page1, { hasNextPage: true, endCursor: "c1" }),
      connectionPage(page2),
    ];
    const calls = [];
    const { nodes } = fetchConnectionPages({
      query: "q",
      variables: { owner: "o", name: "r", number: 1 },
      select: (pr) => pr.reviewThreads,
      execGraphql: ({ variables }) => {
        calls.push(variables.after ?? null);
        return pages.shift();
      },
    });

    expect(nodes).toHaveLength(101);
    expect(calls).toEqual([null, "c1"]);
    const result = toFindings({ reviewThreads: nodes });
    expect(result.unresolvedThreadCount).toBe(1);
    expect(result.findings[0].id).toBe("t_unresolved_101");
  });

  it("throws when the PR is missing so partial collection never passes", () => {
    expect(() =>
      fetchConnectionPages({
        query: "q",
        variables: { owner: "o", name: "r", number: 999 },
        select: (pr) => pr.reviewThreads,
        execGraphql: () => ({ repository: { pullRequest: null } }),
      }),
    ).toThrow(/PR が見つかりません/);
  });
});

describe("toFindings", () => {
  it("uses the thread node id as the stable finding id with seq as display only", () => {
    const older = thread({
      id: "PRRT_old",
      comments: {
        nodes: [
          { author: { login: "devin" }, body: "a", url: "u1", createdAt: "2026-01-01T00:00:00Z" },
        ],
      },
    });
    const newer = thread({ id: "PRRT_new" });
    const result = toFindings({ reviewThreads: [newer, older] });

    expect(result.unresolvedThreadCount).toBe(2);
    expect(result.findings[0].id).toBe("PRRT_old");
    expect(result.findings[0].seq).toBe("f1");
    expect(result.findings[1].id).toBe("PRRT_new");
    expect(result.findings[1].seq).toBe("f2");
  });

  it("keeps a finding's id unchanged when another thread becomes resolved", () => {
    const before = toFindings({
      reviewThreads: [thread({ id: "PRRT_a" }), thread({ id: "PRRT_b" })],
    });
    const bIdBefore = before.findings.find((f) => f.id === "PRRT_b").id;

    const after = toFindings({
      reviewThreads: [thread({ id: "PRRT_a", isResolved: true }), thread({ id: "PRRT_b" })],
    });
    const bFinding = after.findings.find((f) => f.id === "PRRT_b");

    expect(bFinding.id).toBe(bIdBefore);
    expect(after.unresolvedThreadCount).toBe(1);
    expect(after.resolvedThreadCount).toBe(1);
  });

  it("counts resolved and outdated threads separately", () => {
    const result = toFindings({
      reviewThreads: [
        thread({ id: "t1", isResolved: true }),
        thread({ id: "t2", isOutdated: true }),
        thread({ id: "t3" }),
      ],
    });

    expect(result.resolvedThreadCount).toBe(1);
    expect(result.outdatedThreadCount).toBe(1);
    expect(result.unresolvedThreadCount).toBe(2);
    expect(result.findings.map((f) => f.id)).toEqual(["t2", "t3"]);
  });

  it("flags threads whose comments were truncated by the page size", () => {
    const truncated = thread({
      id: "t1",
      comments: { pageInfo: { hasNextPage: true }, nodes: [] },
    });
    const result = toFindings({ reviewThreads: [truncated, thread({ id: "t2" })] });

    expect(result.truncatedCommentThreads).toBe(1);
    expect(result.findings[0].commentsTruncated).toBe(true);
    expect(result.findings[1].commentsTruncated).toBe(false);
  });

  it("includes non-empty CHANGES_REQUESTED and COMMENTED review bodies", () => {
    const result = toFindings({
      reviews: [
        {
          id: "PRR_1",
          state: "CHANGES_REQUESTED",
          body: "修正してください",
          url: "u1",
          submittedAt: "2026-01-03T00:00:00Z",
          author: { login: "human" },
        },
        {
          id: "PRR_2",
          state: "COMMENTED",
          body: "補足です",
          url: "u2",
          submittedAt: "2026-01-04T00:00:00Z",
          author: { login: "bot" },
        },
        { id: "PRR_3", state: "APPROVED", body: "LGTM", url: "u3", author: { login: "h" } },
        { id: "PRR_4", state: "COMMENTED", body: "", url: "u4", author: { login: "h" } },
      ],
    });

    expect(result.reviewFindingCount).toBe(2);
    const reviewFindings = result.findings.filter((f) => f.kind === "review");
    expect(reviewFindings.map((f) => f.id)).toEqual(["PRR_1", "PRR_2"]);
    expect(reviewFindings[0].state).toBe("CHANGES_REQUESTED");
  });

  it("includes PR issue comments as findings", () => {
    const result = toFindings({
      comments: [
        {
          id: "IC_1",
          body: "会話コメントの指摘",
          url: "u",
          createdAt: "2026-01-05T00:00:00Z",
          author: { login: "human" },
        },
      ],
    });

    expect(result.issueCommentCount).toBe(1);
    expect(result.findings[0].kind).toBe("issue_comment");
    expect(result.findings[0].id).toBe("IC_1");
  });

  it("declares the collection scope and completeness in the output", () => {
    const result = toFindings({});
    expect(result.scope).toContain("review threads");
    expect(result.scope).toContain("review bodies");
    expect(result.scope).toContain("issue comments");
    expect(result.collectionComplete).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("handles threads without comments", () => {
    const result = toFindings({
      reviewThreads: [thread({ id: "t1", comments: { nodes: [] } })],
    });
    expect(result.findings[0]).toMatchObject({ id: "t1", author: null, body: "", commentCount: 0 });
  });

  it("truncates long bodies", () => {
    const longBody = "x".repeat(2000);
    const result = toFindings({
      reviewThreads: [
        thread({
          id: "t1",
          comments: {
            nodes: [
              {
                author: { login: "a" },
                body: longBody,
                url: "u",
                createdAt: "2026-01-01T00:00:00Z",
              },
            ],
          },
        }),
      ],
    });
    expect(result.findings[0].body).toHaveLength(1000);
  });
});
