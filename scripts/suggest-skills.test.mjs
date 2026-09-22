import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readChangedPaths, resolveDefaultBase, suggestSkillsForPaths } from "./suggest-skills.mjs";

function suggestedSkills(result) {
  return result.suggestions.map((s) => s.skill);
}

describe("suggestSkillsForPaths", () => {
  it("suggests convex-local-ops for convex changes", () => {
    const result = suggestSkillsForPaths(["convex/expenses.ts"]);
    expect(suggestedSkills(result)).toContain("convex-local-ops");
  });

  it("suggests e2e-spec-authoring for e2e spec changes", () => {
    const result = suggestSkillsForPaths(["e2e/group-access.spec.ts"]);
    expect(suggestedSkills(result)).toContain("e2e-spec-authoring");
    expect(result.runtimeRelevant).toBe(true);
  });

  it("suggests env and ops skills for .env and workflow changes", () => {
    const envResult = suggestSkillsForPaths(["docs/environment-variables.md", ".env.example"]);
    expect(suggestedSkills(envResult)).toEqual(
      expect.arrayContaining(["local-dev-env", "service-ops-safety", "security-review"]),
    );

    const workflowResult = suggestSkillsForPaths([".github/workflows/e2e.yml"]);
    expect(suggestedSkills(workflowResult)).toEqual(
      expect.arrayContaining(["security-review", "service-ops-safety"]),
    );
  });

  it("suggests receipt-tax-domain and line-integration for their domains", () => {
    expect(suggestedSkills(suggestSkillsForPaths(["convex/aiExpenseDrafts/index.ts"]))).toContain(
      "receipt-tax-domain",
    );
    expect(suggestedSkills(suggestSkillsForPaths(["convex/lineWebhook/actions.ts"]))).toContain(
      "line-integration",
    );
  });

  it("does not match auth inside unrelated words like authoring", () => {
    const result = suggestSkillsForPaths(["skills/e2e-spec-authoring/SKILL.md"]);
    expect(suggestedSkills(result)).not.toContain("security-review");
  });

  it("suggests security-review for real auth and webhook paths", () => {
    expect(suggestedSkills(suggestSkillsForPaths(["convex/users/auth.ts"]))).toContain(
      "security-review",
    );
    expect(suggestedSkills(suggestSkillsForPaths(["convex/lineWebhook/http.ts"]))).toContain(
      "security-review",
    );
  });

  it("suggests nothing for process-only changes and reports runtime_relevant false", () => {
    const result = suggestSkillsForPaths([
      "docs/development-process.md",
      "skills/code-review/SKILL.md",
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.runtimeRelevant).toBe(false);
  });

  it("suggests nothing extra for generic app code", () => {
    const result = suggestSkillsForPaths(["src/App.tsx"]);
    expect(result.suggestions).toEqual([]);
    expect(result.runtimeRelevant).toBe(true);
  });
});

describe("readChangedPaths", () => {
  const tempDirs = [];

  function gitRepo() {
    const dir = mkdtempSync(path.join(os.tmpdir(), "suggest-skills-"));
    tempDirs.push(dir);
    const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git(["init", "-b", "preview"]);
    git(["config", "user.email", "t@example.com"]);
    git(["config", "user.name", "t"]);
    return { dir, git };
  }

  function commitAll(git, message) {
    git(["add", "-A"]);
    git(["commit", "-m", message]);
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it("detects committed app changes on a clean worktree", () => {
    const { dir, git } = gitRepo();
    writeFileSync(path.join(dir, "README.md"), "base");
    commitAll(git, "base");
    git(["checkout", "-b", "feature/app"]);
    writeFileSync(path.join(dir, "App.tsx"), "app change");
    commitAll(git, "app change");

    const paths = readChangedPaths({ base: "preview", cwd: dir });
    expect(paths).toContain("App.tsx");
    const result = suggestSkillsForPaths(paths);
    expect(result.runtimeRelevant).toBe(true);
  });

  it("unions the committed diff with uncommitted and untracked changes", () => {
    const { dir, git } = gitRepo();
    writeFileSync(path.join(dir, "README.md"), "base");
    commitAll(git, "base");
    git(["checkout", "-b", "feature/docs"]);
    writeFileSync(path.join(dir, "process.md"), "docs change");
    commitAll(git, "docs change");
    writeFileSync(path.join(dir, "App.tsx"), "uncommitted app change");
    writeFileSync(path.join(dir, "newfile.ts"), "untracked");

    const paths = readChangedPaths({ base: "preview", cwd: dir });
    expect(paths).toEqual(expect.arrayContaining(["process.md", "App.tsx", "newfile.ts"]));
  });

  it("fails explicitly when no base can be resolved", () => {
    const { dir } = gitRepo();
    writeFileSync(path.join(dir, "README.md"), "x");
    expect(() => resolveDefaultBase({ cwd: dir })).toThrow(/baseを解決できません/);
    expect(() => readChangedPaths({ cwd: dir })).toThrow(/baseを解決できません/);
  });
});
