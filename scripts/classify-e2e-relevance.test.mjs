import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  classifyChangedFiles,
  isProcessOnlyPath,
  normalizeChangedPath,
  parseArguments,
  readChangedFiles,
  runE2ERelevanceCheck,
} from "./classify-e2e-relevance.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const E2E_WORKFLOW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.github/workflows/e2e.yml",
);

describe("E2E relevance path classification", () => {
  it("normalizes Windows separators and leading ./", () => {
    expect(normalizeChangedPath(".\\docs\\guide.md")).toBe("docs/guide.md");
  });

  it("recognizes documentation and process-only paths", () => {
    const processOnlyPaths = [
      "README.md",
      "docs/development-process.md",
      "skills/workspace-preflight/SKILL.md",
      ".husky/pre-commit",
      "plugin.json",
      "scripts/review-depth.mjs",
      "scripts/review-depth.test.mjs",
      "scripts/check-task-worktree.mjs",
      "scripts/check-loop-docs.mjs",
      "scripts/check-loop-docs.test.mjs",
      "scripts/collect-pr-findings.mjs",
      "scripts/collect-pr-findings.test.mjs",
      "scripts/suggest-skills.mjs",
      "scripts/suggest-skills.test.mjs",
    ];

    for (const filePath of processOnlyPaths) {
      expect(isProcessOnlyPath(filePath), filePath).toBe(true);
    }
  });

  it("keeps runtime, workflow, harness, and environment paths E2E relevant", () => {
    const runtimePaths = [
      "src/App.tsx",
      "convex/groups.ts",
      "e2e/group-access.spec.ts",
      ".github/workflows/e2e.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/preview-deploy.yml",
      "package.json",
      "scripts/check-test-environment.mjs",
      "scripts/ensure-line-integration-mode.mjs",
      "scripts/start-local-convex.mjs",
      "scripts/sync-e2e-env.mjs",
      "scripts/classify-e2e-relevance.mjs",
      "unknown/config.yaml",
    ];

    for (const filePath of runtimePaths) {
      expect(isProcessOnlyPath(filePath), filePath).toBe(false);
    }
  });

  it("skips only when every changed path is process-only", () => {
    expect(
      classifyChangedFiles(["skills/code-review/SKILL.md", "docs/development-process.md"]),
    ).toMatchObject({
      runtimeRelevant: false,
      reason: "all_changed_paths_process_only",
    });
  });

  it("fails closed for a mixed or unknown change", () => {
    expect(
      classifyChangedFiles(["skills/code-review/SKILL.md", "src/App.tsx", "unknown/config.yaml"]),
    ).toMatchObject({
      runtimeRelevant: true,
      reason: "runtime_relevant_path_detected",
      runtimeRelevantFiles: ["src/App.tsx", "unknown/config.yaml"],
    });
  });

  it("treats an empty diff as having no runtime-relevant paths", () => {
    expect(classifyChangedFiles([])).toMatchObject({
      runtimeRelevant: false,
      reason: "no_changed_paths",
    });
  });

  it("keeps classifier changes and workflow changes E2E relevant", () => {
    expect(isProcessOnlyPath("scripts/classify-e2e-relevance.mjs")).toBe(false);
    expect(isProcessOnlyPath(".github/workflows/e2e.yml")).toBe(false);
  });
});

describe("E2E workflow classification contract", () => {
  it("runs the machine classifier before the existing matrix job", () => {
    const workflow = readFileSync(E2E_WORKFLOW_PATH, "utf8");

    expect(workflow).not.toContain("paths-ignore:");
    expect(workflow).toContain("classify-e2e-relevance.mjs");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("needs: classify");
    expect(workflow).toContain("needs.classify.outputs.runtime_relevant == 'true'");
    expect(workflow).toContain("shared-dev");
    expect(workflow).toContain("name: authenticated");
    expect(workflow).toContain("printf '%s\\n' \"- runtime_relevant: \\`$RUNTIME_RELEVANT\\`\"");
    expect(workflow).toContain("printf '%s\\n' \"- reason: \\`$REASON\\`\"");
    expect(workflow).toContain("printf '%s\\n' \"- changed_paths: \\`$CHANGED_COUNT\\`\"");
  });
});

describe("E2E relevance git and output helpers", () => {
  it("rejects non-commit SHA input before invoking git", () => {
    expect(() => readChangedFiles({ baseSha: "main", headSha: SHA })).toThrow(
      "base SHA must be a 40-character hexadecimal commit SHA",
    );
    expect(() => parseArguments(["--base", SHA, "--head", "bad"])).toThrow(
      "head SHA must be a 40-character hexadecimal commit SHA",
    );
    expect(parseArguments(["--base", SHA, "--head", SHA])).toMatchObject({
      baseSha: SHA,
      headSha: SHA,
      githubOutput: "",
    });
    expect(() => parseArguments(["--base", SHA, "--head", SHA, "--github-output"])).toThrow(
      "--github-output requires a non-empty path",
    );
  });

  it("reads a NUL-delimited diff and writes stable GitHub outputs", () => {
    const repository = mkdtempSync(path.join(os.tmpdir(), "e2e-relevance-check-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repository });
      execFileSync("git", ["config", "user.name", "e2e-relevance-check"], { cwd: repository });
      execFileSync("git", ["config", "user.email", "e2e-relevance-check@example.invalid"], {
        cwd: repository,
      });
      writeFileSync(path.join(repository, "README.md"), "initial\n");
      execFileSync("git", ["add", "README.md"], { cwd: repository });
      execFileSync("git", ["commit", "-qm", "initial"], { cwd: repository });
      const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        encoding: "utf8",
      }).trim();

      mkdirSync(path.join(repository, "docs"));
      writeFileSync(path.join(repository, "docs", "notes.md"), "process-only\n");
      execFileSync("git", ["add", "docs/notes.md"], { cwd: repository });
      execFileSync("git", ["commit", "-qm", "docs"], { cwd: repository });
      const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        encoding: "utf8",
      }).trim();
      const outputPath = path.join(repository, "github-output.txt");

      expect(readChangedFiles({ baseSha, headSha, cwd: repository })).toEqual(["docs/notes.md"]);
      expect(
        runE2ERelevanceCheck({
          baseSha,
          headSha,
          cwd: repository,
          githubOutput: outputPath,
        }),
      ).toMatchObject({
        runtimeRelevant: false,
        reason: "all_changed_paths_process_only",
      });
      expect(readFileSync(outputPath, "utf8")).toBe(
        "runtime_relevant=false\nreason=all_changed_paths_process_only\nchanged_count=1\n",
      );
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
