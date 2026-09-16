import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyCommitSubjects,
  collectPullRequestDecisions,
  isIntegrationHeadRef,
  normalizeHeadRef,
  normalizeMergeSubjectHeadRef,
  resolveReleaseBoundary,
  titleForProductUpdate,
  type SourcePullRequestRecord,
} from "./releaseSourcePullRequests";

const START = "<!-- suzumemo-update:start -->";
const END = "<!-- suzumemo-update:end -->";

function specBlock(yaml: string): string {
  return `## 概要\n\nPR本文\n\n## 更新履歴\n\n${START}\n\`\`\`yaml\n${yaml}\`\`\`\n${END}\n`;
}

function prRecord(overrides: Partial<SourcePullRequestRecord> = {}): SourcePullRequestRecord {
  return {
    number: 1,
    title: "fix: 明細の重複を修正",
    body: specBlock("publish: true\ncategory: fix\ndescription: |\n  明細の重複を修正しました。\n"),
    mergedAt: "2026-09-08T00:00:00Z",
    baseRef: "preview",
    headRef: "feature/x",
    authorType: "User",
    ...overrides,
  };
}

describe("normalizeHeadRef", () => {
  test.each([
    ["fork-owner:feature/x", "feature/x"],
    ["release/m16", "release/m16"],
    ["hondasports/release/m16", "hondasports/release/m16"],
    ["preview", "preview"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeHeadRef(input)).toBe(expected);
  });
});

describe("normalizeMergeSubjectHeadRef", () => {
  test.each([
    ["hondasports/preview", "preview"],
    ["hondasports/release/m16", "release/m16"],
    ["hondasports/feature/x", "feature/x"],
    ["fork-owner:feature/x", "feature/x"],
    ["fork-owner:feature/x/y", "feature/x/y"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeMergeSubjectHeadRef(input)).toBe(expected);
  });
});

describe("isIntegrationHeadRef", () => {
  test.each([
    ["preview", true],
    ["release/m16", true],
    ["hondasports/preview", true],
    ["hondasports/release/m16", true],
    ["main", true],
    ["feature/x", false],
    ["hondasports/feature/x", false],
    ["preview/x", false],
    [undefined, false],
  ])("%s → %s", (input, expected) => {
    expect(isIntegrationHeadRef(input)).toBe(expected);
  });
});

describe("classifyCommitSubjects", () => {
  test("classifies merge commits, branch syncs, and unresolved commits", () => {
    const commits = [
      { sha: "a".repeat(40), subject: "Merge pull request #740 from hondasports/preview" },
      { sha: "b".repeat(40), subject: "Merge pull request #735 from hondasports/feature/draft" },
      { sha: "c".repeat(40), subject: "Merge branch 'main' into preview" },
      { sha: "d".repeat(40), subject: "fix: 下書きの統合(#734)" },
      { sha: "e".repeat(40), subject: "chore: bump deps" },
    ];

    const result = classifyCommitSubjects(commits);
    expect(result[0]).toEqual({
      kind: "pull_request",
      number: 740,
      headRef: "preview",
      sha: "a".repeat(40),
    });
    expect(result[1]).toEqual({
      kind: "pull_request",
      number: 735,
      headRef: "feature/draft",
      sha: "b".repeat(40),
    });
    expect(result[2]).toMatchObject({ kind: "branch_sync" });
    // "(#734)"サフィックスはIssue参照の可能性があるためPR番号として採用しない
    expect(result[3]).toMatchObject({ kind: "unresolved" });
    expect(result[4]).toMatchObject({ kind: "unresolved" });
  });
});

describe("resolveReleaseBoundary", () => {
  const base = "b".repeat(40);
  const source = "s".repeat(40);

  test("uses the previous release asset sourceSha when available", () => {
    const result = resolveReleaseBoundary({
      previousSourceSha: base,
      latestReleaseTag: "app-v2026.09.09-51",
      sourceSha: source,
      revParse: () => undefined,
      mergeBase: (a, b) => (a === base && b === source ? base : undefined),
    });
    expect(result).toEqual({ kind: "resolved", boundarySha: base, note: undefined });
  });

  test("falls back to the latest release tag commit for legacy assets", () => {
    const tagSha = "t".repeat(40);
    const result = resolveReleaseBoundary({
      latestReleaseTag: "app-v2026.09.09-51",
      sourceSha: source,
      revParse: (ref) => (ref === "refs/tags/app-v2026.09.09-51^{commit}" ? tagSha : undefined),
      mergeBase: () => tagSha,
    });
    expect(result).toEqual({
      kind: "resolved",
      boundarySha: tagSha,
      note: "前回リリース app-v2026.09.09-51 を境界に使用",
    });
  });

  test("returns initial_release when there is no previous release", () => {
    const result = resolveReleaseBoundary({
      sourceSha: source,
      revParse: () => undefined,
      mergeBase: () => undefined,
    });
    expect(result).toEqual({ kind: "initial_release" });
  });

  test("errors when the previous tag cannot be resolved", () => {
    const result = resolveReleaseBoundary({
      latestReleaseTag: "app-v2026.09.09-51",
      sourceSha: source,
      revParse: () => undefined,
      mergeBase: () => undefined,
    });
    expect(result.kind).toBe("error");
  });

  test("errors when there is no common ancestor", () => {
    const result = resolveReleaseBoundary({
      previousSourceSha: base,
      sourceSha: source,
      revParse: () => undefined,
      mergeBase: () => undefined,
    });
    expect(result.kind).toBe("error");
  });

  test("falls back to merge-base when the boundary is not an ancestor", () => {
    const mb = "m".repeat(40);
    const result = resolveReleaseBoundary({
      previousSourceSha: base,
      sourceSha: source,
      revParse: () => undefined,
      mergeBase: () => mb,
    });
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.boundarySha).toBe(mb);
      expect(result.note).toContain("merge-base");
    }
  });

  test("same commit yields an empty-range resolved boundary", () => {
    const result = resolveReleaseBoundary({
      previousSourceSha: base,
      sourceSha: base,
      revParse: () => undefined,
      mergeBase: () => base,
    });
    expect(result.kind).toBe("resolved");
  });
});

describe("titleForProductUpdate", () => {
  test.each([
    ["fix: 明細の重複を修正", "明細の重複を修正"],
    ["feat(scope): 新しい画面を追加", "新しい画面を追加"],
    ["docs: 手順を更新", "手順を更新"],
    ["明細の重複を修正", "明細の重複を修正"],
    ["fix!: 破壊的変更", "破壊的変更"],
    ["fix: レシートOCR補完の重複明細を修正 (#725)", "レシートOCR補完の重複明細を修正"],
  ])("%s → %s", (input, expected) => {
    expect(titleForProductUpdate(input)).toBe(expected);
  });
});

describe("collectPullRequestDecisions", () => {
  test("publishes a spec'd PR as a pr-N draft", () => {
    const result = collectPullRequestDecisions([{ number: 10 }], [prRecord({ number: 10 })]);
    expect(result.errors).toEqual([]);
    expect(result.drafts).toEqual([
      {
        id: "pr-10",
        title: "明細の重複を修正",
        summary: "明細の重複を修正しました。",
        category: "fix",
      },
    ]);
    expect(result.decisions).toEqual([
      {
        pullRequest: 10,
        outcome: "published",
        reason: "category: fix",
        updateId: "pr-10",
      },
    ]);
  });

  test("records publish:false with its reason", () => {
    const record = prRecord({
      number: 11,
      body: specBlock("publish: false\nreason: 内部リファクタリング\n"),
    });
    const result = collectPullRequestDecisions([{ number: 11 }], [record]);
    expect(result.errors).toEqual([]);
    expect(result.drafts).toEqual([]);
    expect(result.decisions[0]).toMatchObject({
      outcome: "skipped",
      reason: "内部リファクタリング",
    });
  });

  test("excludes integration PRs by head ref without fetching", () => {
    const result = collectPullRequestDecisions([{ number: 740, headRef: "preview" }], []);
    expect(result.errors).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ outcome: "integration" });
  });

  test("excludes integration PRs resolved via the API head ref", () => {
    const record = prRecord({ number: 736, headRef: "preview" });
    const result = collectPullRequestDecisions([{ number: 736 }], [record]);
    expect(result.decisions[0]).toMatchObject({ outcome: "integration" });
    expect(result.drafts).toEqual([]);
  });

  test("exempts bot-authored PRs", () => {
    const record = prRecord({ number: 751, authorType: "Bot", body: null });
    const result = collectPullRequestDecisions([{ number: 751 }], [record]);
    expect(result.errors).toEqual([]);
    expect(result.decisions[0]).toMatchObject({ outcome: "exempt_bot" });
  });

  test("missing marker on a normal PR is an error, not a silent skip", () => {
    const record = prRecord({ number: 12, body: "## 概要\n\n本文のみ\n" });
    const result = collectPullRequestDecisions([{ number: 12 }], [record]);
    expect(result.errors[0]).toContain("PR #12");
    expect(result.drafts).toEqual([]);
  });

  test("missing API record is an error", () => {
    const result = collectPullRequestDecisions([{ number: 99 }], []);
    expect(result.errors[0]).toContain("PR #99");
  });

  test("unmerged PR references are skipped", () => {
    const record = prRecord({ number: 13, mergedAt: null });
    const result = collectPullRequestDecisions([{ number: 13 }], [record]);
    expect(result.decisions[0]).toMatchObject({ outcome: "not_merged" });
  });

  test("already-published PRs are skipped when unpublished set excludes them", () => {
    const record = prRecord({ number: 14 });
    const result = collectPullRequestDecisions([{ number: 14 }], [record], new Set());
    expect(result.decisions[0]).toMatchObject({ outcome: "skipped" });
    expect(result.drafts).toEqual([]);
  });

  test("publishes a non-UI processing fix", () => {
    const record = prRecord({
      number: 15,
      title: "fix: OCR補助の重複を解消",
      body: specBlock("publish: true\ncategory: fix\ndescription: 読み取りの重複を修正\n"),
    });
    const result = collectPullRequestDecisions([{ number: 15 }], [record]);
    expect(result.errors).toEqual([]);
    expect(result.drafts[0].summary).toBe("読み取りの重複を修正");
  });
});

describe("git fixture (実際のマージ方式の再現)", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const dir of tmpRoots.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function git(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  }

  function makeFixture(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "release-range-"));
    tmpRoots.push(dir);
    const g = (args: string[]) => git(dir, args);

    g(["init", "-b", "main"]);
    g(["config", "user.email", "test@example.com"]);
    g(["config", "user.name", "Test"]);

    // 前回リリース(tag46)相当の初期コミット
    g(["commit", "--allow-empty", "-m", "base"]);
    g(["tag", "app-v2026.09.05-46"]);

    // previewブランチ: squash相当・件名の(#N)はIssue参照・rebase相当の複数コミット
    g(["checkout", "-b", "preview"]);
    g(["commit", "--allow-empty", "-m", "fix: 明細の重複を修正"]);
    g(["commit", "--allow-empty", "-m", "fix: 下書きの統合(#734)"]); // squash: 実PRは#735、件名の番号はIssue参照
    g(["checkout", "-b", "feature/late"]);
    g(["commit", "--allow-empty", "-m", "feat: まだリリースしない機能"]);
    g(["checkout", "preview"]);

    // 前回リリース後に preview -> main 統合(feature/late は含めない)
    g(["checkout", "main"]);
    g(["merge", "--no-ff", "preview", "-m", "Merge pull request #740 from hondasports/preview"]);
    g(["tag", "app-v2026.09.08-50"]);

    // preview側で後続変更(次回リリース対象): merge commit 型PR + ブランチ同期
    g(["checkout", "preview"]);
    g(["checkout", "-b", "feature/marker"]);
    g(["commit", "--allow-empty", "-m", "feat: 更新履歴マーカー"]);
    g(["checkout", "preview"]);
    g([
      "merge",
      "--no-ff",
      "feature/marker",
      "-m",
      "Merge pull request #751 from hondasports/feature/marker",
    ]);
    g(["merge", "--no-ff", "main", "-m", "Merge branch 'main' into preview"]);
    g(["commit", "--allow-empty", "-m", "fix: 未マージの後続fix"]);

    // 今回リリース(tag51)相当
    g(["checkout", "main"]);
    g(["merge", "--no-ff", "preview", "-m", "Merge pull request #750 from hondasports/preview"]);

    return dir;
  }

  test("リリース範囲のコミット分類が実マージ方式を再現する", () => {
    const dir = makeFixture();
    const range = "app-v2026.09.08-50..HEAD";
    const output = git(dir, ["log", "--format=%H%x00%s", range]);
    const entries = output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, subject] = line.split("\0");
        return { sha, subject };
      });

    const classified = classifyCommitSubjects(entries);
    const pullRequests = classified.filter((c) => c.kind === "pull_request");
    const unresolved = classified.filter((c) => c.kind === "unresolved");
    const syncs = classified.filter((c) => c.kind === "branch_sync");

    // 統合PR(#750)とfeature/marker(#751)のmerge commitが拾える
    expect(pullRequests.map((c) => (c.kind === "pull_request" ? c.number : -1)).sort()).toEqual([
      750, 751,
    ]);
    const integration = pullRequests.find((c) => c.kind === "pull_request" && c.number === 750);
    expect(integration?.kind === "pull_request" && integration.headRef).toBe("preview");
    // ブランチ同期はPRではない
    expect(syncs.length).toBe(1);
    // PR #751 内の個別コミットと squash相当の後続fixは commits/{sha}/pulls で解決する
    expect(unresolved.length).toBe(2);
    const unresolvedSubjects = unresolved.map((c) => (c.kind === "unresolved" ? c.subject : ""));
    expect(unresolvedSubjects).toContain("feat: 更新履歴マーカー");
    expect(unresolvedSubjects).toContain("fix: 未マージの後続fix");
  });

  test("範囲外のpreview変更(feature/late)は混入しない", () => {
    const dir = makeFixture();
    const output = git(dir, ["log", "--format=%s", "app-v2026.09.08-50..HEAD"]);
    expect(output).not.toContain("まだリリースしない機能");
    // tag46->tag50 の範囲には feature/late が含まれないこと
    const older = git(dir, ["log", "--format=%s", "app-v2026.09.05-46..app-v2026.09.08-50"]);
    expect(older).toContain("明細の重複を修正");
    expect(older).not.toContain("まだリリースしない機能");
  });
});
