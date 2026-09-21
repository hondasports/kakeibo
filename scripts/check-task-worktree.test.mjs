import { describe, expect, it } from "vitest";

import {
  evaluateWorkspaceState,
  isDocumentationOnlyPath,
  parseWorktreeList,
  stagedFilesRequireIsolation,
} from "./check-task-worktree.mjs";

describe("parseWorktreeList", () => {
  it("parses linked worktrees and detached entries", () => {
    const entries = parseWorktreeList(
      [
        "worktree C:/repo",
        "HEAD abc123",
        "branch refs/heads/preview",
        "",
        "worktree C:/tmp/task",
        "HEAD def456",
        "branch refs/heads/codex/task",
        "",
        "worktree C:/tmp/detached",
        "HEAD ghi789",
        "detached",
      ].join("\n"),
    );

    expect(entries).toEqual([
      { path: "C:/repo", branch: "preview", detached: false },
      { path: "C:/tmp/task", branch: "codex/task", detached: false },
      { path: "C:/tmp/detached", branch: "", detached: true },
    ]);
  });
});

describe("evaluateWorkspaceState", () => {
  const isolatedTask = {
    branch: "codex/task",
    currentPath: "C:/tmp/task",
    canonicalPath: "C:/repo",
    registered: true,
    dirty: false,
  };

  it("passes for a clean isolated task worktree", () => {
    expect(evaluateWorkspaceState({ ...isolatedTask, requireClean: true })).toMatchObject({
      ok: true,
      errors: [],
      baseline: "CLEAN",
    });
  });

  it("rejects protected branches", () => {
    expect(
      evaluateWorkspaceState({ ...isolatedTask, branch: "preview", requireClean: true }),
    ).toMatchObject({ ok: false });
    expect(
      evaluateWorkspaceState({ ...isolatedTask, branch: "main", requireClean: true }),
    ).toMatchObject({ ok: false });
  });

  it("rejects detached HEAD", () => {
    expect(
      evaluateWorkspaceState({ ...isolatedTask, branch: "", requireClean: true }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("rejects the canonical worktree even on a task branch", () => {
    expect(
      evaluateWorkspaceState({
        ...isolatedTask,
        currentPath: "C:/repo",
        branch: "codex/task",
        requireClean: true,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an unregistered worktree", () => {
    expect(
      evaluateWorkspaceState({ ...isolatedTask, registered: false, requireClean: true }),
    ).toMatchObject({ ok: false });
  });

  it("requires a clean baseline only when requested", () => {
    expect(
      evaluateWorkspaceState({ ...isolatedTask, dirty: true, requireClean: false }),
    ).toMatchObject({
      ok: true,
      baseline: "DIRTY",
    });
    expect(
      evaluateWorkspaceState({ ...isolatedTask, dirty: true, requireClean: true }),
    ).toMatchObject({
      ok: false,
      baseline: "DIRTY",
    });
  });
});

describe("documentation-only exceptions", () => {
  it("keeps policy and executable process files inside the isolation requirement", () => {
    expect(isDocumentationOnlyPath("docs/development-process.md")).toBe(true);
    expect(isDocumentationOnlyPath("README.md")).toBe(true);
    expect(isDocumentationOnlyPath("AGENTS.md")).toBe(false);
    expect(isDocumentationOnlyPath("skills/code-review/SKILL.md")).toBe(false);
    expect(isDocumentationOnlyPath("scripts/check-task-worktree.mjs")).toBe(false);
    expect(isDocumentationOnlyPath("src/example.ts")).toBe(false);
  });

  it("requires isolation when any staged path is not documentation-only", () => {
    expect(stagedFilesRequireIsolation(["docs/guide.md", "README.md"])).toBe(false);
    expect(stagedFilesRequireIsolation(["docs/guide.md", "AGENTS.md"])).toBe(true);
    expect(stagedFilesRequireIsolation([])).toBe(false);
  });
});
