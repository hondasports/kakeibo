import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const PROCESS_ONLY_SCRIPT_PATTERN =
  /^scripts\/(?:review-depth|check-task-worktree|check-loop-docs|collect-pr-findings|suggest-skills|machine-risk|assess-change|generate-harness-docs|loop-(?:runner|policy|schema|pr-check|test-fixtures|metrics)|loop\/[\w-]+)(?:\.test)?\.mjs$/;

/** Normalize a Git path to a stable repository-relative form. */
export function normalizeChangedPath(filePath) {
  return String(filePath)
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

/** Return true only for process/documentation policy files; unknown paths stay E2E-relevant. */
export function isProcessOnlyPath(filePath) {
  const normalized = normalizeChangedPath(filePath);

  if (!normalized || normalized.includes("/../") || normalized.startsWith("../")) {
    return false;
  }

  if (normalized.endsWith(".md")) {
    return true;
  }

  if (
    normalized === "AGENTS.md" ||
    normalized === "plugin.json" ||
    normalized.startsWith(".agent/") ||
    // Harness eval fixtures/config are process artifacts with no app surface.
    normalized.startsWith("eval/") ||
    normalized.startsWith(".github/ISSUE_TEMPLATE/") ||
    normalized.startsWith("skills/") ||
    normalized.startsWith(".husky/")
  ) {
    return true;
  }

  return PROCESS_ONLY_SCRIPT_PATTERN.test(normalized);
}

/** Vitest discovers test files even inside dot-dirs (glob uses dot:true). */
const TEST_FILE_BASENAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * Paths whose content cannot change lint/unit/build outcomes: Markdown prose,
 * issue templates, and local git hooks. Used to scope `--verify unit --scope
 * affected` to paths unit can actually observe (isUnitRelatedPath). This
 * predicate is stricter than isProcessOnlyPath on purpose.
 * A test-pattern basename inside a metadata dir is NOT metadata-only: vitest
 * would still pick it up and change `vitest run` output.
 */
export function isMetadataOnlyPath(filePath) {
  const normalized = normalizeChangedPath(filePath);
  if (!normalized || normalized.includes("/../") || normalized.startsWith("../")) {
    return false;
  }
  if (TEST_FILE_BASENAME.test(normalized)) return false;
  // public/ assets are copied verbatim into the build output — a .md there is
  // observable by `vite build` without any importing file to flag.
  if (normalized.startsWith("public/")) return false;
  return (
    normalized.endsWith(".md") ||
    normalized.startsWith(".github/ISSUE_TEMPLATE/") ||
    normalized.startsWith(".husky/")
  );
}

/** Classify a changed-path set and return the machine-readable E2E decision. */
export function classifyChangedFiles(changedPaths = []) {
  const normalizedPaths = [
    ...new Set((changedPaths ?? []).map(normalizeChangedPath).filter(Boolean)),
  ];
  const processOnlyFiles = normalizedPaths.filter(isProcessOnlyPath);
  const runtimeRelevantFiles = normalizedPaths.filter((filePath) => !isProcessOnlyPath(filePath));

  let reason = "no_changed_paths";
  if (runtimeRelevantFiles.length > 0) {
    reason = "runtime_relevant_path_detected";
  } else if (normalizedPaths.length > 0) {
    reason = "all_changed_paths_process_only";
  }

  return {
    changedPaths: normalizedPaths,
    processOnlyFiles,
    runtimeRelevantFiles,
    runtimeRelevant: runtimeRelevantFiles.length > 0,
    reason,
  };
}

/** Reject untrusted git revision input before passing it to the git subprocess. */
function validateCommitSha(value, name) {
  if (!COMMIT_SHA_PATTERN.test(value)) {
    throw new Error(`${name} must be a 40-character hexadecimal commit SHA`);
  }
}

/** Read changed paths between two validated commits using NUL-delimited git output. */
export function readChangedFiles({ baseSha, headSha, cwd = process.cwd() }) {
  validateCommitSha(baseSha, "base SHA");
  validateCommitSha(headSha, "head SHA");

  const output = execFileSync(
    "git",
    [
      "--no-pager",
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACDMRTUXB",
      "-z",
      `${baseSha}...${headSha}`,
    ],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return output.split("\0").filter(Boolean);
}

/** Append stable scalar outputs for a GitHub Actions step. */
function writeGitHubOutput(outputPath, result) {
  appendFileSync(
    outputPath,
    [
      `runtime_relevant=${result.runtimeRelevant}`,
      `reason=${result.reason}`,
      `changed_count=${result.changedPaths.length}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

/** Print a concise, secret-free classification result for the job log. */
function printResult(result) {
  console.log("E2E_RELEVANCE status: PASS");
  console.log(`runtime_relevant: ${result.runtimeRelevant}`);
  console.log(`reason: ${result.reason}`);
  console.log(`changed_paths: ${result.changedPaths.length}`);
}

/** Run classification for a pull request and optionally write its Actions outputs. */
export function runE2ERelevanceCheck({ baseSha, headSha, cwd = process.cwd(), githubOutput } = {}) {
  const result = classifyChangedFiles(readChangedFiles({ baseSha, headSha, cwd }));
  printResult(result);
  if (githubOutput) {
    writeGitHubOutput(githubOutput, result);
  }
  return result;
}

/** Parse the CLI arguments used by the pull-request classification job. */
export function parseArguments(args) {
  const options = { baseSha: "", headSha: "", githubOutput: "" };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--base") {
      options.baseSha = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--head") {
      options.headSha = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--github-output") {
      const outputPath = args[index + 1] ?? "";
      if (!outputPath || outputPath.startsWith("--")) {
        throw new Error("--github-output requires a non-empty path");
      }
      options.githubOutput = outputPath;
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  validateCommitSha(options.baseSha, "base SHA");
  validateCommitSha(options.headSha, "head SHA");

  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    runE2ERelevanceCheck(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error("E2E_RELEVANCE status: FAIL");
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
