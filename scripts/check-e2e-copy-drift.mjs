import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 2文字以下の汎用語（「削除」「保存」等）は誤検知が多いため対象外にする。 */
export const MIN_COPY_LENGTH = 3;
export const ALLOW_MARKER = "e2e-copy-drift: allow";

const JAPANESE_PATTERN = /[\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}]/u;
const QUOTED_PATTERN = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const JSX_TEXT_PATTERN = />([^<>{}]+)</g;
const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*)/;
const BARE_TEXT_FORBIDDEN_PATTERN = /[{}=;<>'"`]/;
const TEST_PATH_PATTERN =
  /(?:\.test\.|\.spec\.|(?:^|\/)__tests__\/|(?:^|\/)src\/test\/|TestMocks\.|(?:^|\/)testFixtures\.|(?:^|\/)testHelpers\.)/;
const TEST_PATHSPEC_EXCLUDES = [
  ":(exclude,glob)**/*.test.*",
  ":(exclude,glob)**/*.spec.*",
  ":(exclude,glob)**/__tests__/**",
  ":(exclude,glob)src/test/**",
  ":(exclude,glob)**/*TestMocks.*",
  ":(exclude,glob)**/testFixtures.*",
  ":(exclude,glob)**/testHelpers.*",
];
const E2E_TITLE_PATTERN = /^\s*(?:await\s+)?test(?:\.\w+)*\(\s*["'`]/;

const MAX_BUFFER = 256 * 1024 * 1024;

export function isTestSourcePath(filePath) {
  return TEST_PATH_PATTERN.test(filePath);
}

function isCopyCandidate(text) {
  const trimmed = text.trim();
  return (
    [...trimmed].length >= MIN_COPY_LENGTH &&
    JAPANESE_PATTERN.test(trimmed) &&
    !trimmed.includes("${")
  );
}

/** `git diff -U0` の出力から、テストを除く src/** の削除行（先頭の `-` を除く）を返す。 */
export function parseRemovedSourceLines(diffText) {
  const removed = [];
  let countable = false;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git (?:"a\/.+?"|a\/.+?) (?:"b\/(.+)"|b\/(.+))$/.exec(line);
      const filePath = match?.[1] ?? match?.[2] ?? "";
      countable = filePath.startsWith("src/") && !isTestSourcePath(filePath);
    } else if (countable && line.startsWith("-") && !line.startsWith("---")) {
      removed.push(line.slice(1));
    }
  }
  return removed;
}

/** 1行から日本語の文字列リテラル・JSXテキストを抽出する（動的な文言は対象外）。 */
export function extractCopyStrings(line) {
  if (COMMENT_LINE_PATTERN.test(line)) {
    return [];
  }
  const found = [];
  for (const match of line.matchAll(QUOTED_PATTERN)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }
  for (const match of line.matchAll(JSX_TEXT_PATTERN)) {
    found.push(match[1]);
  }
  if (!BARE_TEXT_FORBIDDEN_PATTERN.test(line)) {
    found.push(line);
  }
  return [...new Set(found.map((text) => text.trim()).filter(isCopyCandidate))];
}

/** コメント行とテストのタイトル行は文言が表示されるかに関与しないため照合しない。 */
function isIgnoredE2eLine(text) {
  return COMMENT_LINE_PATTERN.test(text) || E2E_TITLE_PATTERN.test(text);
}

/**
 * 削除された文言のうちHEADのsrcに無く、e2eに残っているものを返す。
 * e2eLines: [{ file, line, text }]
 */
export function findCopyDrift({ removedStrings, headSrcText, e2eLines }) {
  const gone = [...new Set(removedStrings)].filter((copy) => !headSrcText.includes(copy));
  const drift = [];
  for (const copy of gone) {
    for (const entry of e2eLines) {
      if (
        entry.text.includes(copy) &&
        !entry.text.includes(ALLOW_MARKER) &&
        !isIgnoredE2eLine(entry.text)
      ) {
        drift.push({ file: entry.file, line: entry.line, copy });
      }
    }
  }
  return drift;
}

function git(args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
}

function gitGrepAll(head, pathspecs) {
  try {
    return git(["grep", "-n", "-I", "-e", "", head, "--", ...pathspecs]);
  } catch (error) {
    if (error.status === 1) {
      return "";
    }
    throw error;
  }
}

function stripRef(output, head) {
  const prefix = `${head}:`;
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
}

/** base...head の差分と head のツリーを読み、残存文言を返す。 */
export function checkCopyDrift({ base, head }) {
  const diff = git(["diff", "-U0", `${base}...${head}`, "--", "src"]);
  const removedStrings = parseRemovedSourceLines(diff).flatMap(extractCopyStrings);
  if (removedStrings.length === 0) {
    return [];
  }
  const srcLines = stripRef(gitGrepAll(head, ["src", ...TEST_PATHSPEC_EXCLUDES]), head).map(
    (entry) => entry.replace(/^[^:]+:\d+:/, ""),
  );
  const e2eLines = stripRef(gitGrepAll(head, ["e2e"]), head).flatMap((entry) => {
    const match = /^(.+?):(\d+):(.*)$/.exec(entry);
    return match ? [{ file: match[1], line: Number(match[2]), text: match[3] }] : [];
  });
  return findCopyDrift({ removedStrings, headSrcText: srcLines.join("\n"), e2eLines });
}

export function parseArguments(args) {
  const options = { base: "origin/preview", head: "HEAD" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base" || arg === "--head") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      options.base = arg;
    }
  }
  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const drift = checkCopyDrift(options);
    for (const item of drift) {
      console.error(`${item.file}:${item.line}: "${item.copy}"`);
    }
    if (drift.length > 0) {
      console.error(
        `E2E_COPY_DRIFT: ${drift.length} 件。src から削除・変更された文言が e2e に残っています。e2e を新しい文言に更新するか、旧文言が表示されないことを確かめる行に "${ALLOW_MARKER}" を付けてください。`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `E2E_COPY_DRIFT error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
