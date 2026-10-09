import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { METRICS_MARKER_PREFIX, SUMMARY_SCHEMA, extractMetricsSummary } from "./loop-metrics.mjs";
import { repositorySlugFromRemoteUrl } from "./loop-runner.mjs";

/**
 * Collect per-task metric summaries published on PRs by
 * `loop-runner.mjs --publish-metrics` and either re-emit them as JSONL
 * (identical records to `--format summary-json`) or aggregate them into a
 * median/p90 table grouped by harnessVersion and tier.
 *
 * Network access goes through `gh` only; nothing writes to the repo.
 */

const gh = (args, root) =>
  execFileSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

/** owner/name for the repo behind origin; null when it cannot be resolved locally. */
export function resolveSlug(root = process.cwd(), services = {}) {
  if (services.slug) return services.slug;
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const slug = repositorySlugFromRemoteUrl(remote);
    if (slug) return slug;
  } catch {
    // fall through to gh
  }
  try {
    const parsed = JSON.parse((services.gh ?? gh)(["repo", "view", "--json", "owner,name"], root));
    if (parsed?.owner?.login && parsed?.name) return `${parsed.owner.login}/${parsed.name}`;
  } catch {
    // leave null
  }
  return null;
}

/** Pull numbers touched since `since` (YYYY-MM-DD); merged keeps only merged PRs. */
export function listPullRequests(slug, { since, state = "merged" }, root, services = {}) {
  const run = services.gh ?? gh;
  const states = state === "merged" ? ["merged"] : ["all"];
  const prs = [];
  for (const ghState of states) {
    const output = run(
      [
        "pr",
        "list",
        "--repo",
        slug,
        "--state",
        ghState,
        "--json",
        "number,mergedAt,updatedAt",
        "--limit",
        "1000",
      ],
      root,
    );
    for (const pr of JSON.parse(output)) {
      const at = state === "merged" ? pr.mergedAt : pr.updatedAt;
      if (since && (!at || at.slice(0, 10) < since)) continue;
      prs.push(pr.number);
    }
  }
  return [...new Set(prs)];
}

/** All issue comments on a PR, one page at a time so tests can mock page loops. */
export function listIssueComments(slug, pr, root, services = {}) {
  const run = services.gh ?? gh;
  const comments = [];
  for (let page = 1; ; page += 1) {
    const batch = JSON.parse(
      run(["api", `repos/${slug}/issues/${pr}/comments?per_page=100&page=${page}`], root),
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  return comments;
}

/**
 * Read every marked metrics comment on the given PRs. Broken JSON is skipped
 * and counted (AC3), never fatal.
 */
export function collectSummaries(slug, prs, root, services = {}) {
  const records = [];
  let skipped = 0;
  for (const pr of prs) {
    for (const comment of listIssueComments(slug, pr, root, services)) {
      const body = comment?.body;
      if (typeof body !== "string" || !body.includes(METRICS_MARKER_PREFIX)) continue;
      const summary = extractMetricsSummary(body);
      if (summary) records.push(summary);
      else skipped += 1;
    }
  }
  return { records, skipped };
}

const percentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
};
const median = (sorted) => percentile(sorted, 50);
const p90 = (sorted) => percentile(sorted, 90);

/**
 * Input tokens for a role, or undefined when it was never measured. Records
 * published before Issue #985 encode "never measured" as a zero-filled token
 * object with 0 model calls (same schema id), so that shape is treated as
 * unmeasured instead of as a measured 0.
 */
function measuredInput(record, role) {
  const tokens = record.tokens?.[role];
  if (tokens == null) return undefined;
  const legacyPlaceholder =
    tokens.input === 0 &&
    tokens.cachedInput === 0 &&
    tokens.output === 0 &&
    record.modelCalls?.[role] === 0;
  return legacyPlaceholder ? undefined : tokens.input;
}

/** Metrics compared across harness versions/tiers in the table format. */
const TABLE_FIELDS = [
  ["tokens.implementer.input", (record) => measuredInput(record, "implementer")],
  ["tokens.reviewer.input", (record) => measuredInput(record, "reviewer")],
  ["transitions", (record) => record.transitions],
  ["reviewRounds", (record) => record.reviewRounds],
  ["ciFailures", (record) => record.ciFailures],
  ["runnerCommands", (record) => record.runnerCommands],
];

export function aggregateTable(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.harnessVersion ?? "unknown"}\t${record.tier ?? "unknown"}`;
    const group = groups.get(key) ?? {
      harnessVersion: record.harnessVersion ?? "unknown",
      tier: record.tier ?? "unknown",
      records: [],
    };
    group.records.push(record);
    groups.set(key, group);
  }
  const rows = [...groups.values()]
    .sort(
      (a, b) => a.harnessVersion.localeCompare(b.harnessVersion) || a.tier.localeCompare(b.tier),
    )
    .map((group) => {
      const row = {
        harnessVersion: group.harnessVersion,
        tier: group.tier,
        tasks: group.records.length,
      };
      for (const [name, pick] of TABLE_FIELDS) {
        const values = group.records
          .map(pick)
          .filter((value) => Number.isFinite(value))
          .sort((a, b) => a - b);
        row[`${name} p50`] = values.length ? median(values) : null;
        row[`${name} p90`] = values.length ? p90(values) : null;
      }
      return row;
    });
  return rows;
}

export function renderTable(rows) {
  const headers = [
    "harnessVersion",
    "tier",
    "tasks",
    ...TABLE_FIELDS.flatMap(([name]) => [`${name} p50`, `${name} p90`]),
  ];
  const lines = [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map(
      (row) =>
        `| ${headers.map((h) => row[h] ?? (h.startsWith("tokens") ? "未計測" : "—")).join(" | ")} |`,
    ),
  ];
  return lines.join("\n");
}

/**
 * One JSONL record per summary — the same shape `loop-metrics.mjs
 * --format summary-json` emits — so eval output and PR-comment output merge
 * cleanly (AC8).
 */
export function recordsFromJsonl(text) {
  const records = [];
  let skipped = 0;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      // Same schema gate as extractMetricsSummary — non-summary JSONL must
      // not leak into the aggregate (review f-5).
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.schema === SUMMARY_SCHEMA
      )
        records.push(parsed);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

export function parseArguments(args) {
  const out = {};
  const options = new Set(["--since", "--state", "--format", "--repo", "--pr"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (!options.has(arg)) throw new Error(`unknown option: ${arg}`);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    out[arg.slice(2)] = value;
    i += 1;
  }
  return out;
}

export function run(args, cwd = process.cwd(), services = {}) {
  const slug = args.repo ?? resolveSlug(cwd, services);
  if (!slug) throw new Error("repository slug not resolved; pass --repo <owner/name>");
  if (args.state !== undefined && !["merged", "all"].includes(args.state))
    throw new Error("--state must be merged|all");
  const prs = args.pr
    ? args.pr.split(",").map((value) => {
        const pr = Number(value);
        if (!Number.isInteger(pr) || pr <= 0) throw new Error(`invalid --pr: ${value}`);
        return pr;
      })
    : listPullRequests(
        slug,
        { since: args.since ?? null, state: args.state ?? "merged" },
        cwd,
        services,
      );
  const { records, skipped } = collectSummaries(slug, prs, cwd, services);
  const report = { prs: prs.length, collected: records.length, skippedMalformed: skipped };
  if (args.format === "table") {
    return { report, table: renderTable(aggregateTable(records)) };
  }
  if (args.format !== undefined && args.format !== "jsonl")
    throw new Error(`unknown --format: ${args.format}`);
  return { report, records };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run(parseArguments(process.argv.slice(2)));
    if (result.table !== undefined) console.log(result.table);
    else if (result.records)
      for (const record of result.records) console.log(JSON.stringify(record));
    console.error(
      `collected ${result.report.collected} summaries from ${result.report.prs} PRs` +
        `; skipped ${result.report.skippedMalformed} malformed marker comments`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
