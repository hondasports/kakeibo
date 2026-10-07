import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const ALL_ZERO_SHA_PATTERN = /^0{40}$/;

/**
 * Return true when any changed path is not Markdown.
 * An empty/unknown path list is treated as code-changed (safe side).
 */
export function ciCodeChanged(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true;
  return paths.some((filePath) => !String(filePath).endsWith(".md"));
}

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

function writeGitHubOutput(outputPath, result) {
  appendFileSync(
    outputPath,
    [
      `code_changed=${result.codeChanged}`,
      `reason=${result.reason}`,
      `changed_count=${result.changedPaths.length}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function printResult(result) {
  console.log("CI_SCOPE status: PASS");
  console.log(`code_changed: ${result.codeChanged}`);
  console.log(`reason: ${result.reason}`);
  console.log(`changed_paths: ${result.changedPaths.length}`);
}

/**
 * Classify whether the diff contains non-Markdown changes.
 * Unreachable/missing bases, brand-new branches (all-zero `before`), and diff
 * failures all resolve to code_changed=true so jobs never skip on doubt.
 */
export function runCiChangeScope({ baseSha, headSha, cwd = process.cwd(), githubOutput } = {}) {
  let result;
  if (ALL_ZERO_SHA_PATTERN.test(baseSha)) {
    result = { codeChanged: true, reason: "branch_created", changedPaths: [] };
  } else {
    let changedPaths = null;
    try {
      changedPaths = readChangedFiles({ baseSha, headSha, cwd });
    } catch {
      // 到達不能なSHA・shallow cloneの欠落などは安全側に倒す
      changedPaths = null;
    }
    if (changedPaths === null) {
      result = { codeChanged: true, reason: "diff_failed", changedPaths: [] };
    } else {
      result = {
        codeChanged: ciCodeChanged(changedPaths),
        reason: "diff",
        changedPaths,
      };
    }
  }
  printResult(result);
  if (githubOutput) {
    writeGitHubOutput(githubOutput, result);
  }
  return result;
}

/** Parse the CLI arguments used by the scope job. */
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
    runCiChangeScope(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error("CI_SCOPE status: FAIL");
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
