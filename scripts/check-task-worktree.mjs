import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTECTED_BRANCHES = new Set(["main", "preview"]);

function normalizePath(value) {
  return path
    .resolve(value)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

export function parseWorktreeList(output) {
  const entries = [];
  let entry = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (entry) entries.push(entry);
      entry = { path: line.slice("worktree ".length), branch: "", detached: false };
      continue;
    }

    if (!entry) continue;
    if (line.startsWith("branch ")) {
      entry.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      entry.detached = true;
    }
  }

  if (entry) entries.push(entry);
  return entries;
}

export function isDocumentationOnlyPath(filePath) {
  const normalized = String(filePath)
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");

  return normalized === "README.md" || normalized.startsWith("docs/");
}

export function stagedFilesRequireIsolation(files) {
  return files.some((file) => !isDocumentationOnlyPath(file));
}

export function evaluateWorkspaceState({
  branch,
  currentPath,
  canonicalPath,
  registered,
  dirty,
  requireClean,
}) {
  const errors = [];

  if (!branch) {
    errors.push("detached HEAD or branch name could not be determined");
  } else if (PROTECTED_BRANCHES.has(branch)) {
    errors.push(`protected base branch '${branch}' is not a task branch`);
  }

  if (!canonicalPath) {
    errors.push("canonical worktree could not be determined");
  } else if (normalizePath(currentPath) === normalizePath(canonicalPath)) {
    errors.push("current directory is the canonical worktree");
  }

  if (!registered) {
    errors.push("current worktree is not registered in git worktree list");
  }

  if (requireClean && dirty) {
    errors.push("baseline worktree is dirty; resolve pre-existing changes before editing");
  }

  return {
    ok: errors.length === 0,
    errors,
    baseline: dirty ? "DIRTY" : "CLEAN",
  };
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function readStagedFiles(cwd) {
  const output = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB", "-z"], cwd);
  return output.split("\0").filter(Boolean);
}

function printResult({ result, branch, currentPath, canonicalPath, scope }) {
  console.log(`WORKSPACE_PREFLIGHT status: ${result.ok ? "PASS" : "FAIL"}`);
  if (scope) console.log(`scope: ${scope}`);
  console.log(`branch: ${branch === null ? "(not checked)" : branch || "(detached)"}`);
  console.log(
    `current_worktree: ${currentPath === null ? "(not checked)" : currentPath || "(unknown)"}`,
  );
  console.log(
    `canonical_worktree: ${canonicalPath === null ? "(not checked)" : canonicalPath || "(unknown)"}`,
  );
  console.log(`baseline: ${result.baseline}`);
  for (const error of result.errors) console.error(`error: ${error}`);
}

export function runWorkspacePreflight({
  cwd = process.cwd(),
  requireClean = false,
  staged = false,
} = {}) {
  try {
    if (staged) {
      const stagedFiles = readStagedFiles(cwd);
      if (stagedFiles.length === 0) {
        printResult({
          result: { ok: true, errors: [], baseline: "NOT_CHECKED" },
          branch: null,
          currentPath: null,
          canonicalPath: null,
          scope: "no staged files",
        });
        return 0;
      }

      if (!stagedFilesRequireIsolation(stagedFiles)) {
        printResult({
          result: { ok: true, errors: [], baseline: "NOT_CHECKED" },
          branch: null,
          currentPath: null,
          canonicalPath: null,
          scope: "documentation-only exception",
        });
        return 0;
      }
    }

    const entries = parseWorktreeList(runGit(["worktree", "list", "--porcelain"], cwd));
    const currentPath = runGit(["rev-parse", "--show-toplevel"], cwd).trim();
    const branch = runGit(["branch", "--show-current"], cwd).trim();
    const status = runGit(["status", "--porcelain=v1"], cwd);
    const canonicalPath = entries[0]?.path || "";
    const registered = entries.some(
      (entry) => normalizePath(entry.path) === normalizePath(currentPath),
    );
    const result = evaluateWorkspaceState({
      branch,
      currentPath,
      canonicalPath,
      registered,
      dirty: status.length > 0,
      requireClean,
    });

    printResult({ result, branch, currentPath, canonicalPath });
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error("WORKSPACE_PREFLIGHT status: FAIL");
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function parseArguments(args) {
  const options = { requireClean: false, staged: false };
  for (const arg of args) {
    if (arg === "--require-clean") options.requireClean = true;
    else if (arg === "--staged") options.staged = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? normalizePath(process.argv[1]) : "";
const modulePath = normalizePath(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    process.exitCode = runWorkspacePreflight(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error("WORKSPACE_PREFLIGHT status: FAIL");
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
