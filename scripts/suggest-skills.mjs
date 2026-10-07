import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChangedFiles } from "./classify-e2e-relevance.mjs";
import { machineRiskForChange, readChangedHunks } from "./machine-risk.mjs";

const COMMIT_REF_PATTERN = /^[0-9a-zA-Z][0-9a-zA-Z._/-]{0,127}$/;

/**
 * Path-derived capability-skill suggestions. Workflow stages are managed by
 * .agent/process.yaml and are not represented as skills; judgement still applies on top.
 *
 * `match` はパターン判定、`exactPaths` はリテラルpath（実在がテストで検証される）。
 */
export const SKILL_SUGGESTION_RULES = [
  {
    skills: ["convex-local-ops"],
    reason: "convex/ の変更",
    match: (p) => p.startsWith("convex/"),
  },
  {
    skills: ["security-review"],
    reason: "認証・認可・webhook・secret・外部write境界に関わる変更",
    match: (p) =>
      /(?:^|[/._-])(?:auth|permission|guard|webhook|secret)(?![a-z])|[a-z](?:Auth|Permission|Guard|Webhook|Secret)/i.test(
        p,
      ) ||
      /system-admin|group-admin/i.test(p) ||
      p.startsWith(".github/workflows/") ||
      p.startsWith(".env"),
  },
  {
    skills: ["e2e-spec-authoring"],
    reason: "E2E spec・seed・project選択に関わる変更",
    exactPaths: ["playwright.config.ts"],
    match: (p) => p.startsWith("e2e/"),
  },
  {
    skills: ["receipt-tax-domain"],
    reason: "レシート・税計算・下書き金額に関わる変更",
    match: (p) => /receipt|tax|aiExpense|ai-expense/i.test(p),
  },
  {
    skills: ["line-integration"],
    reason: "LINE連携(webhook・リッチメニュー・連携mode)に関わる変更",
    match: (p) =>
      p.startsWith("convex/lineWebhook/") ||
      p.startsWith("convex/lineLink/") ||
      p.startsWith("docs/line") ||
      /line-rich-menu|line-integration/i.test(p),
  },
  {
    skills: ["local-dev-env"],
    reason: "ローカル環境・env・dev起動に関わる変更",
    exactPaths: [
      "docs/environment-variables.md",
      "mise.toml",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "scripts/check-test-environment.mjs",
      "scripts/start-local-convex.mjs",
      "scripts/sync-e2e-env.mjs",
    ],
    match: (p) => p.startsWith(".env"),
  },
  {
    skills: ["service-ops-safety"],
    reason: "env・deploy・外部操作に関わる変更",
    exactPaths: ["docs/environment-variables.md", "vercel.json", "scripts/sync-e2e-env.mjs"],
    match: (p) => p.startsWith(".env") || p.startsWith(".github/workflows/"),
  },
];

function ruleMatches(rule, changedPath) {
  return rule.exactPaths?.includes(changedPath) || rule.match?.(changedPath) === true;
}

/** Suggest conditional skills for a changed-path set. */
export function suggestSkillsForPaths(changedPaths = []) {
  const classification = classifyChangedFiles(changedPaths);
  const suggestions = [];

  for (const rule of SKILL_SUGGESTION_RULES) {
    const matchedPaths = classification.changedPaths.filter((p) => ruleMatches(rule, p));
    if (matchedPaths.length === 0) continue;
    for (const skill of rule.skills) {
      const existing = suggestions.find((s) => s.skill === skill);
      if (existing) {
        existing.matchedPaths.push(...matchedPaths);
        existing.reasons.add(rule.reason);
      } else {
        suggestions.push({
          skill,
          matchedPaths: [...matchedPaths],
          reasons: new Set([rule.reason]),
        });
      }
    }
  }

  return {
    runtimeRelevant: classification.runtimeRelevant,
    reason: classification.reason,
    changedPaths: classification.changedPaths,
    suggestions: suggestions.map((s) => ({
      skill: s.skill,
      reasons: [...s.reasons],
      matchedPaths: [...new Set(s.matchedPaths)].sort(),
    })),
  };
}

/**
 * Path rules plus the Machine Floor content rules (Issue #944): a hunk that
 * touches auth/deletion/schema/external-write symbols also suggests
 * security-review, even when the file path is innocuous. `diffFailed`
 * (unreadable diff) adds the same suggestion — fail-closed like the floor.
 */
export function suggestSkillsForChange({ changedPaths = [], hunks = {}, diffFailed = false } = {}) {
  const result = suggestSkillsForPaths(changedPaths);
  const content = machineRiskForChange({ paths: changedPaths, hunks, diffFailed });
  // diff_read_failed is a fail-closed sentinel, not a symbol match — it must not
  // suggest skills by itself.
  const contentHits = content.floorTriggerDetails.filter(
    (detail) => detail.source === "content" && detail.trigger !== "diff_read_failed",
  );
  if (contentHits.length === 0) return result;
  const reason = "差分内の認証・認可・データ削除・schema・外部write境界コード（content rule検知）";
  const existing = result.suggestions.find((s) => s.skill === "security-review");
  if (existing) {
    existing.reasons.push(reason);
    existing.matchedPaths = [
      ...new Set([...existing.matchedPaths, ...contentHits.map((d) => d.path).filter(Boolean)]),
    ].sort();
  } else {
    result.suggestions.push({
      skill: "security-review",
      reasons: [reason],
      matchedPaths: [...new Set(contentHits.map((d) => d.path).filter(Boolean))].sort(),
    });
  }
  return result;
}

/** Read the worktree diff (uncommitted + untracked) as the candidate path set. */
export function readWorktreeChangedPaths({ cwd = process.cwd() } = {}) {
  const tracked = execFileSync(
    "git",
    ["--no-pager", "diff", "--name-only", "--no-renames", "-z", "HEAD"],
    { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return [...tracked.split("\0"), ...untracked.split("\0")].filter(Boolean);
}

/** Read the committed diff against a base ref (merge-base three-dot). */
export function readBranchChangedPaths({ base, cwd = process.cwd() } = {}) {
  if (!COMMIT_REF_PATTERN.test(base)) {
    throw new Error(`不正なbase指定です: ${base}`);
  }
  const output = execFileSync(
    "git",
    ["--no-pager", "diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`],
    { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return output.split("\0").filter(Boolean);
}

function refExists(ref, cwd) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the PR's base from its actual baseRefName — never the remote default
 * branch, which is unrelated to the PR's base. Throws unless a base is found;
 * pass --base explicitly when no PR exists for the current branch.
 */
export function resolvePrBase({ cwd = process.cwd(), execGh } = {}) {
  const runGh = execGh ?? ((args) => execFileSync("gh", args, { cwd, encoding: "utf8" }));
  let baseRefName = null;
  try {
    baseRefName = String(
      JSON.parse(runGh(["pr", "view", "--json", "baseRefName"]))?.baseRefName ?? "",
    ).trim();
  } catch {
    // no gh / no PR for this branch — fall through to the explicit error below
  }
  if (!baseRefName || !COMMIT_REF_PATTERN.test(baseRefName)) {
    throw new Error(
      "PRのbaseを解決できません（このbranchに紐付くPRがありません）。--base <ref> を指定してください",
    );
  }
  const remoteRef = `origin/${baseRefName}`;
  if (refExists(remoteRef, cwd)) return remoteRef;
  if (refExists(baseRefName, cwd)) return baseRefName;
  throw new Error(
    `PRのbase ${baseRefName} に対応するrefがローカルにありません。--base <ref> を指定してください`,
  );
}

/**
 * Union of the committed branch diff and the worktree diff. Used for both skill
 * suggestions and E2E relevance so the verdict cannot depend on whether the
 * change happens to be committed yet.
 */
export function readChangedPaths({ base, cwd = process.cwd(), execGh } = {}) {
  const resolvedBase = base ?? resolvePrBase({ cwd, execGh });
  const committed = readBranchChangedPaths({ base: resolvedBase, cwd });
  const worktree = readWorktreeChangedPaths({ cwd });
  return [...new Set([...committed, ...worktree])].sort();
}

export function parseArguments(args) {
  const parsed = { cwd: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") continue;
    if (args[index] === "--base") {
      parsed.base = args[index + 1];
      index += 1;
    } else if (args[index] === "--paths") {
      parsed.paths = String(args[index + 1])
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      index += 1;
    } else {
      throw new Error(`未知の引数: ${args[index]}`);
    }
  }
  return parsed;
}

export function runSuggestSkills({ base, paths, cwd } = {}) {
  const changedPaths = paths ?? readChangedPaths({ base, cwd });
  // Content check is best-effort for suggestions; an unreadable diff still
  // flags security-review via the fail-closed path (Issue #944).
  let hunks = {};
  let diffFailed = false;
  try {
    const resolvedBase = base ?? resolvePrBase({ cwd });
    hunks = readChangedHunks({ base: resolvedBase, cwd, paths: changedPaths });
  } catch {
    diffFailed = true;
  }
  const result = suggestSkillsForChange({ changedPaths, hunks, diffFailed });

  console.log("SKILL_SUGGEST status: PASS");
  console.log(`changed_paths: ${result.changedPaths.length}`);
  console.log(`runtime_relevant: ${result.runtimeRelevant} (${result.reason})`);
  if (result.suggestions.length === 0) {
    console.log("suggested_skills: (なし)");
  } else {
    for (const suggestion of result.suggestions) {
      console.log(`suggested_skill: ${suggestion.skill} (${suggestion.reasons.join("; ")})`);
    }
  }
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runSuggestSkills(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.log("SKILL_SUGGEST status: FAIL");
    console.log(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
