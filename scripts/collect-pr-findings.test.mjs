import { describe, expect, it } from "vitest";

import { fetchConnectionPages, parseHandledContent, toFindings } from "./collect-pr-findings.mjs";

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

  it("collects non-empty review bodies in all states, including APPROVED", () => {
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
        {
          id: "PRR_3",
          state: "APPROVED",
          body: "LGTM",
          url: "u3",
          submittedAt: "2026-01-05T00:00:00Z",
          author: { login: "h" },
        },
        {
          id: "PRR_4",
          state: "APPROVED",
          body: "承認します。この誤字は直してください",
          url: "u4",
          submittedAt: "2026-01-06T00:00:00Z",
          author: { login: "h" },
        },
        { id: "PRR_5", state: "COMMENTED", body: "", url: "u5", author: { login: "h" } },
      ],
    });

    expect(result.reviewFindingCount).toBe(4);
    const reviewFindings = result.findings.filter((f) => f.kind === "review");
    expect(reviewFindings.map((f) => f.id)).toEqual(["PRR_1", "PRR_2", "PRR_3", "PRR_4"]);
    const approved = reviewFindings.filter((f) => f.state === "APPROVED");
    expect(approved).toHaveLength(2);
    // APPROVED+LGTM is collected as a candidate; whether it needs action is a
    // managed-finding decision recorded via the handled list, not a filter here.
    expect(approved.find((f) => f.id === "PRR_3").body).toBe("LGTM");
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

  it("declares the collection scope and page completeness in the output", () => {
    const result = toFindings({});
    expect(result.scope).toContain("review threads");
    expect(result.scope).toContain("review bodies");
    expect(result.scope).toContain("issue comments");
    expect(result.pagesComplete).toBe(true);
    expect(result.unhandledCount).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("handles threads without comments", () => {
    const result = toFindings({
      reviewThreads: [thread({ id: "t1", comments: { nodes: [] } })],
    });
    expect(result.findings[0]).toMatchObject({ id: "t1", author: null, body: "", commentCount: 0 });
  });

  it("truncates long bodies and flags them with the URL for the full text", () => {
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
    expect(result.findings[0].bodyTruncated).toBe(true);
    expect(result.findings[0].url).toBe("u");
  });

  it("keeps thread replies visible instead of dropping everything after the first comment", () => {
    const result = toFindings({
      reviewThreads: [
        thread({
          id: "t1",
          comments: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                author: { login: "bot" },
                body: "指摘1",
                url: "u1",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
              },
              {
                author: { login: "devin" },
                body: "修正しましたが、こちらは未対応です",
                url: "u2",
                createdAt: "2026-01-01T01:00:00Z",
                updatedAt: "2026-01-01T01:00:00Z",
              },
            ],
          },
        }),
      ],
    });

    expect(result.findings[0].replies).toHaveLength(1);
    expect(result.findings[0].replies[0].body).toContain("未対応");
    expect(result.findings[0].replies[0].url).toBe("u2");
  });

  it("counts only unhandled candidates so a PR with notifications can still converge", () => {
    const input = {
      reviews: [
        {
          id: "PRR_1",
          state: "CHANGES_REQUESTED",
          body: "修正してください",
          url: "u1",
          submittedAt: "2026-01-03T00:00:00Z",
          updatedAt: "2026-01-03T00:00:00Z",
          author: { login: "h" },
        },
      ],
      comments: [
        {
          id: "IC_vercel",
          body: "preview deployed",
          url: "u2",
          createdAt: "2026-01-04T00:00:00Z",
          updatedAt: "2026-01-04T00:00:00Z",
          author: { login: "vercel" },
        },
      ],
    };
    const everything = toFindings(input);
    expect(everything.unhandledCount).toBe(2);

    const handled = parseHandledContent(
      "PRR_1 2026-01-03T00:00:00Z\nIC_vercel 2026-01-04T00:00:00Z\n",
    );
    const converged = toFindings({ ...input, handled });
    expect(converged.unhandledCount).toBe(0);
    expect(converged.findings).toHaveLength(2);
  });

  it("resurfaces a handled finding when its body was edited after the recorded updatedAt", () => {
    const input = {
      comments: [
        {
          id: "IC_1",
          body: "edited comment",
          url: "u",
          createdAt: "2026-01-05T00:00:00Z",
          updatedAt: "2026-01-06T09:00:00Z",
          author: { login: "h" },
        },
      ],
    };
    const handled = parseHandledContent("IC_1 2026-01-05T00:00:00Z\n");
    const result = toFindings({ ...input, handled });

    expect(result.unhandledCount).toBe(1);
    expect(result.unhandled[0].id).toBe("IC_1");
  });

  it("rejects an id-only handled record since it could never expire", () => {
    expect(() => parseHandledContent("IC_1\n")).toThrow(/updatedAt/);
  });

  it("keeps a candidate unhandled when its own updatedAt is missing", () => {
    const input = {
      comments: [
        {
          id: "IC_1",
          body: "comment without updatedAt",
          url: "u",
          createdAt: "2026-01-05T00:00:00Z",
          author: { login: "h" },
        },
      ],
    };
    const handled = parseHandledContent("IC_1 2026-01-05T00:00:00Z\n");
    expect(toFindings({ ...input, handled }).unhandledCount).toBe(1);
  });

  it("always counts unresolved threads as unhandled even with a handled record", () => {
    // A reply added or edited later does not change the first comment's
    // updatedAt, so only GitHub's resolve state can mark a thread handled.
    const input = {
      reviewThreads: [
        thread({
          id: "PRRT_t1",
          comments: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                author: { login: "bot" },
                body: "指摘",
                url: "u1",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
              },
              {
                author: { login: "human" },
                body: "修正では直っていません",
                url: "u2",
                createdAt: "2026-01-01T01:00:00Z",
                updatedAt: "2026-01-01T01:00:00Z",
              },
            ],
          },
        }),
      ],
    };
    const handled = parseHandledContent("PRRT_t1 2026-01-01T00:00:00Z\n");
    const result = toFindings({ ...input, handled });

    expect(result.unhandledCount).toBe(1);
    expect(result.unhandled[0].id).toBe("PRRT_t1");
  });
});
