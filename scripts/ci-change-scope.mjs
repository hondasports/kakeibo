import { appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadUnitRelatedMap, unitMappedTests } from "./unit-related-map.mjs";

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

/**
 * fs依存のunit関連map（verify:prepushと同じ正本）から、変更ファイルを読む
 * 契約テストを引く。mapに存在しないテストは対象外にする。
 * mapが無い・壊れている場合は例外を投げ、呼び出し側で安全側に倒す。
 */
export function ciMappedUnitTests(changedPaths, { cwd = process.cwd(), unitMap } = {}) {
  const map = unitMap ?? loadUnitRelatedMap(cwd, { required: true });
  return unitMappedTests(changedPaths, map).filter((testPath) =>
    existsSync(path.join(cwd, testPath)),
  );
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
      `mapped_tests=${result.mappedTests.join(" ")}`,
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
  console.log(`mapped_tests: ${result.mappedTests.length}`);
}

/**
 * Classify whether the diff contains non-Markdown changes.
 * Unreachable/missing bases, brand-new branches (all-zero `before`), diff
 * failures, and an unreadable unit-related map all resolve to
 * code_changed=true so jobs never skip on doubt. `mappedTests` lists the
 * fs-dependent contract tests that read the changed files (unit-related-map
 * が正本。空なら .md のみの変更で Test ジョブごと skip してよい)。
 */
export function runCiChangeScope({
  baseSha,
  headSha,
  cwd = process.cwd(),
  githubOutput,
  unitMap,
  readChanged = readChangedFiles,
} = {}) {
  let result;
  if (ALL_ZERO_SHA_PATTERN.test(baseSha)) {
    result = { codeChanged: true, reason: "branch_created", changedPaths: [], mappedTests: [] };
  } else {
    let changedPaths = null;
    try {
      changedPaths = readChanged({ baseSha, headSha, cwd });
    } catch {
      // 到達不能なSHA・shallow cloneの欠落などは安全側に倒す
      changedPaths = null;
    }
    if (changedPaths === null) {
      result = { codeChanged: true, reason: "diff_failed", changedPaths: [], mappedTests: [] };
    } else {
      try {
        result = {
          codeChanged: ciCodeChanged(changedPaths),
          reason: "diff",
          changedPaths,
          mappedTests: ciMappedUnitTests(changedPaths, { cwd, unitMap }),
        };
      } catch {
        // unit関連mapが読めないと文書依存テストを確定できない → 安全側で全ジョブ実行
        result = {
          codeChanged: true,
          reason: "unit_map_failed",
          changedPaths,
          mappedTests: [],
        };
      }
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
