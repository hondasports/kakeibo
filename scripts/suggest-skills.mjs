import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChangedFiles } from "./classify-e2e-relevance.mjs";

const COMMIT_REF_PATTERN = /^[0-9a-zA-Z][0-9a-zA-Z._/-]{0,127}$/;

/**
 * Path-derived conditional-skill suggestions. Generic stage skills
 * (implementation / verification / code-review / delivery / pr-aftercare) are
 * always required and are not listed; judgement still applies on top.
 */
const SKILL_SUGGESTION_RULES = [
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
    match: (p) => p.startsWith("e2e/") || p === "playwright.config.ts",
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
    match: (p) =>
      p.startsWith(".env") ||
      p === "docs/environment-variables.md" ||
      p === "mise.toml" ||
      p === "convex.json" ||
      p === "package.json" ||
      p === "pnpm-lock.yaml" ||
      p === "pnpm-workspace.yaml" ||
      [
        "scripts/sync-e2e-env.mjs",
        "scripts/start-local-convex.mjs",
        "scripts/check-test-environment.mjs",
        "scripts/refresh-local-runtime-data.mjs",
      ].includes(p),
  },
  {
    skills: ["service-ops-safety"],
    reason: "env・deploy・外部操作に関わる変更",
    match: (p) =>
      p.startsWith(".env") ||
      p === "docs/environment-variables.md" ||
      p === "vercel.json" ||
      p.startsWith(".github/workflows/") ||
      p === "scripts/sync-e2e-env.mjs",
  },
];

/** Suggest conditional skills for a changed-path set. */
export function suggestSkillsForPaths(changedPaths = []) {
  const classification = classifyChangedFiles(changedPaths);
  const suggestions = [];

  for (const rule of SKILL_SUGGESTION_RULES) {
    const matchedPaths = classification.changedPaths.filter(rule.match);
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
  const result = suggestSkillsForPaths(changedPaths);

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
