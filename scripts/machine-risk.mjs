import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeChangedPath } from "./classify-e2e-relevance.mjs";

const RULES = [
  {
    trigger: "authentication_or_authorization",
    match: (filePath) =>
      /(?:^|[/._-])(?:auth|permission|guard)(?![a-z])|system-admin|group-admin/i.test(filePath),
  },
  {
    trigger: "schema_or_migration",
    match: (filePath) =>
      filePath === "convex/schema.ts" || /(?:^|\/)migrations?(?:\/|$)/i.test(filePath),
  },
  {
    trigger: "data_deletion_or_retention",
    match: (filePath) => /delet|retention/i.test(filePath),
  },
  {
    trigger: "complex_state_transition_or_orchestration_port",
    match: (filePath) =>
      filePath.startsWith(".agent/") ||
      filePath.startsWith(".github/workflows/") ||
      /^scripts\/(?:loop[-/]|assess-|machine-risk)/.test(filePath),
  },
  {
    trigger: "external_service_write_or_webhook",
    match: (filePath) => /webhook|line-integration|resend/i.test(filePath),
  },
];

/** Content rules apply only to app/backend TypeScript sources, never tests. */
const CONTENT_TARGET_PATTERN = /^(?:convex|src)\/[^?]*\.tsx?$/;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.tsx?$/;
export const isContentTarget = (filePath) =>
  CONTENT_TARGET_PATTERN.test(filePath) && !TEST_FILE_PATTERN.test(filePath);

const AUTH_CONTENT_PATTERN =
  /getUserIdentity|ctx\.auth|requireGroup\w*|assert\w*(?:Member|Owner|Admin)|groupMembers|systemAdmins|role\s*===?\s*["'](?:owner|member)/;
const SCHEMA_CONTENT_PATTERN = /defineTable|defineSchema|\.index\(/;
const EXTERNAL_CONTENT_PATTERN = /httpAction|Resend|api\.line\.me/;

/**
 * Content-based floor rules (Issue #944): dangerous symbols inside the changed
 * hunks fire the same triggers as path rules, so auth/deletion/schema/external
 * writes in plain-named files cannot slip under the floor.
 *
 * `match(lines, filePath)` receives the added+deleted lines of that path.
 * Over-detection is intentional — comment/string edits also fire (AC2).
 */
const CONTENT_RULES = [
  {
    trigger: "authentication_or_authorization",
    match: (lines) => lines.some((line) => AUTH_CONTENT_PATTERN.test(line)),
  },
  {
    trigger: "data_deletion_or_retention",
    match: (lines, filePath) => {
      const joined = lines.join("\n");
      if (/ctx\.db\.delete/.test(joined)) return true;
      if (filePath.startsWith("convex/") && /\.delete\(/.test(joined)) return true;
      return /scheduler\.run(?:After|At)/.test(joined) && /\bdelete\b/i.test(joined);
    },
  },
  {
    trigger: "schema_or_migration",
    match: (lines) => lines.some((line) => SCHEMA_CONTENT_PATTERN.test(line)),
  },
  {
    trigger: "external_service_write_or_webhook",
    match: (lines, filePath) =>
      lines.some(
        (line) =>
          EXTERNAL_CONTENT_PATTERN.test(line) ||
          (filePath.startsWith("convex/") && /fetch\(/.test(line)),
      ),
  },
];

/**
 * Compute the machine-enforced minimum review tier for a change set.
 *
 * `hunks` maps a normalized path to its changed lines (added and deleted,
 * prefix stripped). `diffFailed` marks a diff that could not be read at all —
 * the floor then fails closed to T3 (AC5), reported as `diff_read_failed`.
 *
 * `floorTriggers` stays a string list for backward compatibility; per-match
 * attribution lands in `floorTriggerDetails` ({trigger, source, path}).
 */
export function machineRiskForChange({ paths = [], hunks = {}, diffFailed = false } = {}) {
  const changedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const details = [];
  for (const rule of RULES) {
    for (const filePath of changedPaths.filter(rule.match)) {
      details.push({ trigger: rule.trigger, source: "path", path: filePath });
    }
  }
  for (const rule of CONTENT_RULES) {
    for (const filePath of changedPaths.filter(isContentTarget)) {
      const lines = hunks[filePath] ?? [];
      if (lines.length > 0 && rule.match(lines, filePath)) {
        details.push({ trigger: rule.trigger, source: "content", path: filePath });
      }
    }
  }
  if (diffFailed) {
    details.push({ trigger: "diff_read_failed", source: "content", path: null });
  }
  const triggers = [...new Set(details.map((detail) => detail.trigger))];
  return {
    changedPaths,
    floorTriggers: triggers,
    floorTriggerDetails: details,
    minimumTier: triggers.length > 0 ? "T3" : "T1",
  };
}

/** Compute the machine-enforced minimum review tier for changed paths. */
export function machineRiskForPaths(paths = []) {
  return machineRiskForChange({ paths });
}

const MAX_DIFF_BYTES = 10 * 1024 * 1024;
const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_DIFF_BYTES });

/**
 * Accumulate added/deleted lines from a `git diff --unified=0` output.
 * Hunk state comes from `diff --git`/`@@` headers, not from `---`/`+++` lines:
 * a deleted file has `+++ /dev/null` but its `-` lines still belong to the
 * `--- a/` path, and a removed line whose text starts with `-- ` looks like
 * `--- ...` inside the hunk, so header detection applies only before `@@`.
 */
function collectHunks(hunks, diffText) {
  let current = null;
  let oldPath = null;
  let inHunk = false;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = null;
      oldPath = null;
      inHunk = false;
    } else if (!inHunk && line.startsWith("--- a/")) {
      oldPath = normalizeChangedPath(line.slice(6));
    } else if (!inHunk && line.startsWith("--- ")) {
      oldPath = null;
    } else if (!inHunk && line.startsWith("+++ b/")) {
      current = normalizeChangedPath(line.slice(6));
    } else if (!inHunk && line.startsWith("+++ ")) {
      current = oldPath;
    } else if (line.startsWith("@@ ")) {
      inHunk = true;
    } else if (inHunk && current && (line.startsWith("+") || line.startsWith("-"))) {
      (hunks[current] ??= []).push(line.slice(1));
    }
  }
  return hunks;
}

/**
 * Read the change's hunks: committed diff (merge-base..HEAD) plus the worktree
 * diff vs HEAD, plus every line of untracked files (a new file is all-added).
 * Throws on any git failure — callers fail closed (T3) instead of guessing.
 */
export function readChangedHunks({ base, cwd = process.cwd(), paths = [] } = {}) {
  if (!base) throw new Error("readChangedHunks requires a base ref");
  const mergeBase = git(["merge-base", base, "HEAD"], cwd).trim();
  const hunks = {};
  for (const range of [`${mergeBase}..HEAD`, "HEAD"]) {
    const args = ["--no-pager", "diff", "--unified=0", "--no-renames", range];
    if (paths.length > 0) args.push("--", ...paths);
    collectHunks(hunks, git(args, cwd));
  }
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"], cwd)
    .split("\0")
    .filter(Boolean);
  for (const filePath of untracked) {
    const normalized = normalizeChangedPath(filePath);
    if (!isContentTarget(normalized)) continue;
    if (paths.length > 0 && !paths.includes(normalized)) continue;
    const file = path.join(cwd, normalized);
    if (existsSync(file))
      (hunks[normalized] ??= []).push(...readFileSync(file, "utf8").split("\n"));
  }
  return hunks;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const detail = argv.includes("--detail");
  const paths = argv
    .filter((value) => value !== "--detail")
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  const result = machineRiskForPaths(paths);
  console.log(
    JSON.stringify(
      detail
        ? result
        : {
            triggerCount: result.floorTriggers.length,
            floorTriggers: result.floorTriggers,
            minimumTier: result.minimumTier,
          },
      null,
      2,
    ),
  );
}
