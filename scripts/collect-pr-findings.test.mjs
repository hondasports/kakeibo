import { describe, expect, it } from "vitest";

import {
  fetchConnectionPages,
  parseArguments,
  parseHandledContent,
  stripInvisibleMarkup,
  toFindings,
} from "./collect-pr-findings.mjs";

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

  it("skips a bare '--' forwarded by pnpm run", () => {
    const parsed = parseArguments(["--", "--pr", "123"]);
    expect(parsed.pr).toBe("123");
  });
});

describe("stripInvisibleMarkup", () => {
  it("removes single-line and multi-line HTML comments", () => {
    const { body } = stripInvisibleMarkup(
      "本文A<!-- hidden -->\n<!-- multi\nline\ncomment -->\n本文B",
    );
    expect(body).toBe("本文A\n\n本文B");
  });

  it("removes whole-line link reference definitions including vercel's [vc]: lines", () => {
    const { body } = stripInvisibleMarkup(
      "deployed\n[vc]: #aGVsbG8gd29ybGQ=\n[1]: https://example.com/x\nnext",
    );
    expect(body).toBe("deployed\nnext");
  });

  it("does not remove inline links or lines that merely start with a bracket", () => {
    const input = "[link](https://example.com) は残す\n[partial]: trailing は残す";
    const { body } = stripInvisibleMarkup(input);
    expect(body).toBe(input);
  });

  it("strips definitions with titles or angle destinations and ≤3-space indent", () => {
    const input = '[a]: /u "title"\n[b]: <b c>\n   [c]: /x\nkept';
    const { body } = stripInvisibleMarkup(input);
    expect(body).toBe("kept");
  });

  it("keeps [label]: lines whose trailing text is not a quoted title", () => {
    // `[todo]: fix the thing` is not a CommonMark link definition — the
    // trailing words cannot be a title — so GitHub renders it as text.
    const { body } = stripInvisibleMarkup("[todo]: fix the thing");
    expect(body).toBe("[todo]: fix the thing");
  });

  it("keeps lines whose destination is not a valid definition", () => {
    // Unbalanced parens, a bare `<` opener, or a paren title containing a
    // bare `(` all make the line plain text on GitHub.
    for (const line of ["[a]: /u(rl", "[a]: <x", "[a]: /u (a(b)", "[a]: /u extra"]) {
      expect(stripInvisibleMarkup(line).body).toBe(line);
    }
  });

  it("still strips definitions with balanced-paren destinations", () => {
    const input = "[a]: /wiki/foo_(bar)\n[b]: /u (a\\(b)\nkept";
    expect(stripInvisibleMarkup(input).body).toBe("kept");
  });

  it("collapses runs of 3+ blank lines down to 2", () => {
    const { body } = stripInvisibleMarkup("a\n\n\n\n\n\nb");
    expect(body).toBe("a\n\n\nb");
  });

  it("keeps fenced code blocks verbatim including <!-- --> inside them", () => {
    const fence = "```\n<!-- visible in code -->\n[x]: #y\n```";
    const { body } = stripInvisibleMarkup(`head\n${fence}\ntail <!-- gone -->`);
    expect(body).toBe(`head\n${fence}\ntail `);
  });

  it("keeps inline code verbatim including <!-- --> inside it", () => {
    const { body } = stripInvisibleMarkup("見て `<!-- shown -->` ね <!-- gone -->");
    expect(body).toBe("見て `<!-- shown -->` ね ");
  });

  it("keeps a fence left open at EOF verbatim — GitHub renders it as code", () => {
    const input = "text\n```\n<!-- still code -->\n[x]: #y\nmore";
    const { body } = stripInvisibleMarkup(input);
    expect(body).toBe(input);
  });

  it("restores inline code containing $-substitution sequences verbatim", () => {
    const input = "a `$&` b\na `$'` z\na `$$` c";
    const { body } = stripInvisibleMarkup(input);
    expect(body).toBe(input);
  });

  it("does not re-pair backtick runs nested inside a consumed code span", () => {
    const { body } = stripInvisibleMarkup("`` `x` ``");
    expect(body).toBe("`` `x` ``");
  });

  it("keeps <details> blocks untouched", () => {
    const details = "<details>\n<summary>指摘</summary>\nbody\n</details>";
    const { body } = stripInvisibleMarkup(`a\n${details}\nb`);
    expect(body).toBe(`a\n${details}\nb`);
  });

  it("reports how many characters were removed", () => {
    const input = "x<!-- removed -->";
    const { strippedChars } = stripInvisibleMarkup(input);
    expect(strippedChars).toBe(input.length - "x".length);
    expect(stripInvisibleMarkup("plain").strippedChars).toBe(0);
  });

  it("judges bodyTruncated on the normalized body, not the original", () => {
    const padding = "<!-- " + "x".repeat(900) + " -->";
    const visible = "y".repeat(900);
    const result = toFindings({
      comments: [
        {
          id: "IC_1",
          body: `${visible}\n${padding}`,
          url: "u",
          createdAt: "2026-01-05T00:00:00Z",
          author: { login: "h" },
        },
      ],
    });
    const finding = result.findings[0];
    // original is >1000 chars, normalized is <1000 → no truncation
    expect(finding.bodyTruncated).toBe(false);
    expect(finding.body).toHaveLength(visible.length + 1);
    expect(finding.body).toContain(visible);
    expect(finding.strippedChars).toBeGreaterThan(0);
  });

  it("keeps a review whose body normalizes to empty, marked bodyInvisibleOnly", () => {
    const result = toFindings({
      reviews: [
        {
          id: "PRR_inv",
          state: "COMMENTED",
          body: "<!-- only hidden content -->",
          url: "u",
          submittedAt: "2026-01-05T00:00:00Z",
          author: { login: "bot" },
        },
      ],
    });

    expect(result.reviewFindingCount).toBe(1);
    const finding = result.findings[0];
    expect(finding.body).toBe("");
    expect(finding.bodyInvisibleOnly).toBe(true);
    expect(finding.strippedChars).toBeGreaterThan(0);
  });

  it("does not flag an absent comment body as bodyInvisibleOnly", () => {
    const result = toFindings({
      comments: [{ id: "IC_e", body: null, url: "u", author: { login: "h" } }],
    });
    const finding = result.findings[0];
    expect(finding.body).toBe("");
    expect(finding.bodyInvisibleOnly).toBeUndefined();
    expect(finding.strippedChars).toBeUndefined();
  });

  it("still drops reviews whose ORIGINAL body is empty", () => {
    const result = toFindings({
      reviews: [
        { id: "PRR_e1", state: "COMMENTED", body: "", url: "u", author: { login: "h" } },
        { id: "PRR_e2", state: "COMMENTED", body: "  \n ", url: "u", author: { login: "h" } },
      ],
    });
    expect(result.reviewFindingCount).toBe(0);
  });

  it("does not change ids, updatedAt, counts, or handled matching", () => {
    const input = {
      reviews: [
        {
          id: "PRR_1",
          state: "COMMENTED",
          body: "本文 <!-- hidden -->",
          url: "u1",
          submittedAt: "2026-01-03T00:00:00Z",
          updatedAt: "2026-01-03T01:00:00Z",
          author: { login: "h" },
        },
      ],
      comments: [
        {
          id: "IC_1",
          body: "comment\n[vc]: #abc",
          url: "u2",
          createdAt: "2026-01-04T00:00:00Z",
          updatedAt: "2026-01-04T02:00:00Z",
          author: { login: "vercel" },
        },
      ],
    };
    const everything = toFindings(input);
    expect(everything.unhandledCount).toBe(2);
    expect(everything.findings.map((f) => f.id)).toEqual(["PRR_1", "IC_1"]);
    expect(everything.findings.find((f) => f.id === "IC_1").updatedAt).toBe("2026-01-04T02:00:00Z");

    const handled = parseHandledContent("PRR_1 2026-01-03T01:00:00Z\nIC_1 2026-01-04T02:00:00Z\n");
    const converged = toFindings({ ...input, handled });
    expect(converged.unhandledCount).toBe(0);
    expect(converged.findings).toHaveLength(2);
  });
});
