import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOC_SCAN_GLOBS = [/^AGENTS\.md$/, /^docs\/.*\.md$/, /^skills\/[^/]+\/SKILL\.md$/];

const REQUIRED_FRONTMATTER_KEYS = ["name", "description", "license"];

const BANNED_VOCABULARY = [
  /\bPREPARE\b/,
  /\bLearning Event\b/,
  /\breviewer quorum\b/,
  /\bSpec reconciliation\b/i,
  /task\/session binding/,
  /scope integrity/i,
  /docs\/superpowers/,
  /\.loop\//,
  /task-loop\.mjs/,
];

const PATH_REFERENCE_PATTERN =
  /^(?:AGENTS\.md|\.env\.local|(?:docs|skills|scripts|e2e|convex|lib|src|\.github|\.windsurf|\.husky)\/[^\s"'`()[\]{}<>|*$]+)$/;

const CODE_SPAN_PATTERN = /`([^`\n]+)`/g;

/** Referenced but not required to exist (gitignored, or documented as removed). */
const REFERENCE_ALLOWLIST = [/^\.env\.local$/, /^docs\/generated\//, /^convex\/export\.ts$/];
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SKILL_NAME_PATTERN = /^skills\/([a-z0-9-]+)\/SKILL\.md$/;
const SECTION_HEADING_PATTERN = /^## (\d+)\. /gm;

function normalizePath(value) {
  return String(value)
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

export function listDocFiles(repoRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) return;
    for (const entry of readdirSync(absoluteDir)) {
      const relativePath = normalizePath(path.join(relativeDir, entry));
      const absolutePath = path.join(repoRoot, relativePath);
      if (statSync(absolutePath).isDirectory()) {
        walk(relativePath);
        continue;
      }
      if (DOC_SCAN_GLOBS.some((pattern) => pattern.test(relativePath))) {
        files.push(relativePath);
      }
    }
  };
  walk(".");
  return files.sort();
}

export function parseFrontmatter(content) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (fieldMatch) fields[fieldMatch[1]] = fieldMatch[2].trim();
  }
  return fields;
}

export function checkSkillFrontmatter(repoRoot, skillPath) {
  const errors = [];
  const skillName = skillPath.match(SKILL_NAME_PATTERN)?.[1];
  if (!skillName) return errors;

  const content = readFileSync(path.join(repoRoot, skillPath), "utf8");
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push(`${skillPath}: frontmatterがありません`);
    return errors;
  }
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!frontmatter[key]) {
      errors.push(`${skillPath}: frontmatterに必須キー ${key} がありません`);
    }
  }
  if (frontmatter.name && frontmatter.name !== skillName) {
    errors.push(
      `${skillPath}: frontmatterのname(${frontmatter.name})がdir名(${skillName})と一致しません`,
    );
  }
  return errors;
}

export function extractSkillReferences(content) {
  return [...new Set([...String(content).matchAll(/skills\/([a-z0-9-]+)\b/g)].map((m) => m[1]))];
}

export function checkAgentsSkillReferences(repoRoot) {
  const errors = [];
  const agentsPath = path.join(repoRoot, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    return ["AGENTS.md が存在しません"];
  }
  const content = readFileSync(agentsPath, "utf8");
  for (const skillName of extractSkillReferences(content)) {
    if (!existsSync(path.join(repoRoot, "skills", skillName, "SKILL.md"))) {
      errors.push(`AGENTS.md: skills/${skillName} が参照されていますが SKILL.md が存在しません`);
    }
  }
  return errors;
}

function resolveCandidate(repoRoot, docDir, reference) {
  const relativePath = normalizePath(path.posix.join(docDir, reference));
  return {
    relativePath,
    exists:
      existsSync(path.join(repoRoot, relativePath)) &&
      (statSync(path.join(repoRoot, relativePath)).isFile() ||
        statSync(path.join(repoRoot, relativePath)).isDirectory()),
  };
}

function isAllowlisted(reference) {
  return REFERENCE_ALLOWLIST.some((pattern) => pattern.test(reference));
}

function isRepoRootPath(reference) {
  return PATH_REFERENCE_PATTERN.test(reference);
}

export function checkPathReferences(repoRoot, docPath, content) {
  const errors = [];
  const docDir =
    normalizePath(path.posix.dirname(docPath)) === "."
      ? ""
      : normalizePath(path.posix.dirname(docPath));

  for (const match of String(content).matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    // Markdown links are resolved relative to the document (GitHub semantics).
    const { relativePath, exists } = resolveCandidate(repoRoot, docDir, target);
    if (!exists) {
      errors.push(`${docPath}: リンク先 ${target} (${relativePath}) が存在しません`);
    }
  }

  for (const match of String(content).matchAll(CODE_SPAN_PATTERN)) {
    const span = match[1].trim();
    if (/\s/.test(span)) continue;
    const stripped = span.replace(/,+$/, "");
    if (!isRepoRootPath(stripped)) continue;
    const candidate = stripped.replace(/\/$/, "");
    if (isAllowlisted(candidate)) continue;
    // Backticked paths in this repository's docs are always repository-relative.
    const { relativePath, exists } = resolveCandidate(repoRoot, "", candidate);
    if (!exists) {
      errors.push(`${docPath}: 参照 ${candidate} (${relativePath}) が存在しません`);
    }
  }
  return errors;
}

export function checkSectionNumbering(docPath, content) {
  const numbers = [...String(content).matchAll(SECTION_HEADING_PATTERN)].map((m) => Number(m[1]));
  const firstGap = numbers.findIndex((number, index) => number !== index + 1);
  if (firstGap === -1) return [];
  return [
    `${docPath}: セクション番号が連続していません (${firstGap + 1} 番目が ## ${numbers[firstGap]}.)`,
  ];
}

export function checkBannedVocabulary(docPath, content) {
  const errors = [];
  for (const pattern of BANNED_VOCABULARY) {
    const match = String(content).match(pattern);
    if (match) {
      errors.push(`${docPath}: 廃止語彙 "${match[0]}" が残っています`);
    }
  }
  return errors;
}

export function checkLoopDocs(repoRoot) {
  const errors = [];
  const docFiles = listDocFiles(repoRoot);

  errors.push(...checkAgentsSkillReferences(repoRoot));

  for (const docPath of docFiles) {
    const content = readFileSync(path.join(repoRoot, docPath), "utf8");
    errors.push(...checkPathReferences(repoRoot, docPath, content));
    errors.push(...checkBannedVocabulary(docPath, content));
    if (SKILL_NAME_PATTERN.test(docPath)) {
      errors.push(...checkSkillFrontmatter(repoRoot, docPath));
    }
  }

  const processDoc = "docs/development-process.md";
  if (docFiles.includes(processDoc)) {
    const content = readFileSync(path.join(repoRoot, processDoc), "utf8");
    errors.push(...checkSectionNumbering(processDoc, content));
  }

  return { docFiles, errors };
}

function printResult(result) {
  console.log("LOOP_DOCS_CHECK status:", result.errors.length === 0 ? "PASS" : "FAIL");
  console.log(`scanned_files: ${result.docFiles.length}`);
  for (const error of result.errors) {
    console.log(`  - ${error}`);
  }
}

export function runLoopDocsCheck({ cwd = process.cwd() } = {}) {
  const result = checkLoopDocs(cwd);
  printResult(result);
  return result.errors.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runLoopDocsCheck({ cwd: process.cwd() });
}
