import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Shared metrics sink written by recordMetric in loop-runner.mjs (AGENT_METRICS_FILE overrides). */
export function metricsLogPath(root = process.cwd(), env = process.env) {
  if (env.AGENT_METRICS_FILE) return env.AGENT_METRICS_FILE;
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  return path.join(commonDir, "agent-metrics.jsonl");
}

/** Parse the JSONL metrics log; a missing file yields none and malformed lines are skipped. */
export function readMetricsEntries(file) {
  if (!existsSync(file)) return { entries: [], parseErrors: 0 };
  const entries = [];
  let parseErrors = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        parseErrors += 1;
        continue;
      }
      entries.push(parsed);
    } catch {
      parseErrors += 1;
    }
  }
  return { entries, parseErrors };
}

const bump = (bucket, key) => {
  bucket[key] = (bucket[key] ?? 0) + 1;
};

const USAGE_FIELDS = ["calls", "inputUncached", "cacheRead", "cacheWrite", "output", "reasoning"];
/**
 * Token usage per role. A transcript grows while its session runs and may be
 * recorded repeatedly, so only the latest record per (task, transcript) counts;
 * a transcript is its path-derived sourceId (basename `source` for old records).
 */
export function aggregateUsage(entries) {
  const latest = new Map();
  for (const entry of entries) {
    if (entry?.action !== "usage" || typeof entry.source !== "string") continue;
    latest.set(`${entry.taskId}\0${entry.sourceId ?? entry.source}`, entry);
  }
  if (latest.size === 0) return null;
  const sum = () => Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  const total = sum();
  const byRole = Object.create(null);
  for (const entry of latest.values()) {
    const role = (byRole[typeof entry.role === "string" ? entry.role : "other"] ??= sum());
    for (const field of USAGE_FIELDS) {
      const value = Number.isFinite(entry[field]) ? entry[field] : 0;
      role[field] += value;
      total[field] += value;
    }
  }
  return { transcripts: latest.size, total, byRole };
}

/** Aggregate JSONL entries into per-action counts, durations and totals. */
export function aggregateMetrics(entries, { taskId = null } = {}) {
  const filtered = taskId ? entries.filter((entry) => entry.taskId === taskId) : entries;
  // Untrusted JSONL keys (e.g. "__proto__") must not resolve to shared prototypes.
  const actions = Object.create(null);
  for (const entry of filtered) {
    if (typeof entry?.action !== "string") continue;
    const action = (actions[entry.action] ??= { count: 0 });
    action.count += 1;
    if (typeof entry.durationMs === "number")
      action.durationMs = (action.durationMs ?? 0) + entry.durationMs;
    if (entry.action === "verify") {
      action.byKind ??= Object.create(null);
      const kind = (action.byKind[entry.kind] ??= {
        count: 0,
        pass: 0,
        fail: 0,
        durationMs: 0,
      });
      kind.count += 1;
      if (typeof entry.durationMs === "number") kind.durationMs += entry.durationMs;
      if (entry.result === "pass") kind.pass += 1;
      if (entry.result === "fail") kind.fail += 1;
      if (entry.scope) {
        action.byScope ??= Object.create(null);
        bump(action.byScope, entry.scope);
      }
    }
    if (entry.action === "revision_changed") {
      action.reused = (action.reused ?? 0) + (entry.reused ?? 0);
      action.invalidated = (action.invalidated ?? 0) + (entry.invalidated ?? 0);
      if (entry.assessmentCarried === true)
        action.assessmentCarried = (action.assessmentCarried ?? 0) + 1;
    }
    if (entry.action === "review_packet" && entry.scope) {
      action.byScope ??= Object.create(null);
      bump(action.byScope, entry.scope);
    }
    if (entry.action === "transition") {
      action.events ??= Object.create(null);
      bump(action.events, entry.event);
    }
    if (entry.action === "watch_aftercare") {
      action.polls = (action.polls ?? 0) + (entry.polls ?? 0);
      if (entry.ready === true) action.ready = (action.ready ?? 0) + 1;
    }
    if (entry.action === "cli_output") {
      action.byCommand ??= Object.create(null);
      const name = typeof entry.command === "string" ? entry.command : "unknown";
      const command = (action.byCommand[name] ??= {
        count: 0,
        outputBytes: { total: 0, avg: 0, max: 0 },
      });
      // Count only entries that actually carried a size: a malformed or
      // hand-edited line must not drag the average down.
      if (typeof entry.outputBytes === "number") {
        command.count += 1;
        command.outputBytes.total += entry.outputBytes;
        command.outputBytes.max = Math.max(command.outputBytes.max, entry.outputBytes);
        command.outputBytes.avg = Math.round(command.outputBytes.total / command.count);
      }
    }
  }
  const usage = aggregateUsage(filtered);
  return {
    entries: filtered.length,
    tasks: [...new Set(filtered.map((entry) => entry.taskId).filter(Boolean))],
    actions,
    ...(usage ? { usage } : {}),
  };
}

export function parseArguments(args) {
  const out = {};
  const options = new Set(["--path", "--task", "--format", "--out"]);
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

/**
 * Emit the per-task summary as one JSONL record (`--format summary-json`),
 * identical in shape to a record collected by collect-harness-metrics.mjs.
 * Task-state fields (tier/profile/lane/ciFixRounds) come from the worktree's
 * agent-task.json when present; otherwise they are omitted/inferred. With
 * --out the record is appended to that file instead of replacing it.
 */
export function run(args, cwd = process.cwd()) {
  const file = args.path ?? metricsLogPath(cwd);
  const { entries, parseErrors } = readMetricsEntries(file);
  if (args.format === "summary-json") {
    if (!args.task) throw new Error("--format summary-json requires --task <id>");
    const task = loadTaskState(cwd);
    const context =
      task && (!args.task || task.taskId === args.task)
        ? taskSummaryContext(task, cwd)
        : { harnessVersion: harnessVersion(cwd) };
    const summary = summarizeTask(entries, args.task, context);
    const line = `${JSON.stringify(summary)}\n`;
    if (args.out) {
      appendFileSync(args.out, line);
      return { written: args.out, parseErrors };
    }
    return { summary, parseErrors };
  }
  if (args.format !== undefined) throw new Error(`unknown --format: ${args.format}`);
  return {
    source: file,
    parseErrors,
    ...aggregateMetrics(entries, { taskId: args.task ?? null }),
  };
}

/** Stable schema id for per-task metric summaries shared via PR comments / JSONL. */
export const SUMMARY_SCHEMA = "agent-metrics-summary/v1";
/** HTML marker prefix identifying the one PR comment that carries a task's summary. */
export const METRICS_MARKER_PREFIX = "<!-- agent-metrics:v1 ";
export function metricsCommentMarker(taskId) {
  return `${METRICS_MARKER_PREFIX}task=${taskId} -->`;
}

const number = (value) => (Number.isFinite(value) ? value : 0);
const sumBy = (list, pick) => list.reduce((total, item) => total + number(pick(item)), 0);

/**
 * One-line, self-describing metrics summary for a single task. Only counts and
 * ids — never paths, transcript text or env values — so it is safe to publish.
 * `context` supplies task-state fields entries cannot carry:
 * {tier, profile, lane, ciFixRounds, harnessVersion}. Falsy profile/lane/tier
 * are omitted rather than nulled.
 */
export function summarizeTask(entries, taskId, context = {}) {
  const filtered = taskId ? entries.filter((entry) => entry?.taskId === taskId) : entries;
  const usage = aggregateUsage(filtered);
  const roleTokens = (role) => {
    const bucket = usage?.byRole?.[role];
    return {
      // cache writes are billed as input; reasoning rides on output tokens.
      input: number(bucket?.inputUncached) + number(bucket?.cacheWrite),
      cachedInput: number(bucket?.cacheRead),
      output: number(bucket?.output) + number(bucket?.reasoning),
    };
  };
  const transitions = filtered.filter((entry) => entry?.action === "transition");
  const transitionCount = (event) => transitions.filter((entry) => entry.event === event).length;
  const verifyDurationMs = { lint: 0, unit: 0, build: 0, process: 0 };
  for (const entry of filtered) {
    if (entry?.action === "verify" && entry.kind in verifyDurationMs)
      verifyDurationMs[entry.kind] += number(entry.durationMs);
  }
  const summary = {
    schema: SUMMARY_SCHEMA,
    taskId: taskId ?? null,
    harnessVersion: context.harnessVersion ?? null,
    tokens: {
      implementer: roleTokens("implementer"),
      reviewer: roleTokens("reviewer"),
    },
    modelCalls: {
      implementer: number(usage?.byRole?.implementer?.calls),
      reviewer: number(usage?.byRole?.reviewer?.calls),
    },
    runnerCommands: filtered.filter((entry) => entry?.action === "cli_output").length,
    transitions: transitions.length,
    reviewRounds: transitionCount("findings"),
    ciFailures: transitionCount("ci_failure"),
    // The counter's current value, not the cumulative transition count — an
    // INCIDENT round trip may reset it (Issue #942).
    ciFixRounds: context.ciFixRounds ?? transitionCount("ci_failure"),
    verifyDurationMs,
    cliOutputBytes: sumBy(
      filtered.filter((entry) => entry?.action === "cli_output"),
      (entry) => entry.outputBytes,
    ),
    frictionNotes: filtered.filter((entry) => entry?.action === "friction_note").length,
  };
  if (context.tier) summary.tier = context.tier;
  if (context.profile) summary.profile = context.profile;
  if (context.lane) summary.lane = context.lane;
  if (context.harnessVersion == null) delete summary.harnessVersion;
  return summary;
}

/** `<process.yaml version>+<git blob SHA of scripts/loop-runner.mjs, first 12 chars>`. */
export function harnessVersion(root = process.cwd()) {
  let version = null;
  try {
    const raw = readFileSync(path.join(root, ".agent", "process.yaml"), "utf8");
    version = /^version:\s*(\S+)/m.exec(raw)?.[1] ?? null;
  } catch {
    version = null;
  }
  const blobSha = execFileSync("git", ["hash-object", "scripts/loop-runner.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .slice(0, 12);
  return `${version ?? "unknown"}+${blobSha}`;
}

/** The worktree-private task state file, or null when absent/unreadable. */
export function loadTaskState(root = process.cwd()) {
  try {
    const file = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", "agent-task.json"],
      { cwd: root, encoding: "utf8" },
    ).trim();
    if (!existsSync(file)) return null;
    const task = JSON.parse(readFileSync(file, "utf8"));
    return task && typeof task === "object" ? task : null;
  } catch {
    return null;
  }
}

/** Build summarizeTask context from a persisted task plus local harness info. */
export function taskSummaryContext(task, root = process.cwd()) {
  return {
    tier: task?.risk ?? null,
    profile: task?.configuration?.selection?.selected ?? null,
    lane: task?.lane ?? null,
    ciFixRounds: Number.isFinite(task?.counters?.ci) ? task.counters.ci : null,
    harnessVersion: harnessVersion(root),
  };
}

/** Human table + folded JSON for the PR comment body (marker line first). */
export function renderMetricsComment(summary) {
  const fmtTokens = (tokens) =>
    `in ${number(tokens.input)} / cached ${number(tokens.cachedInput)} / out ${number(tokens.output)}`;
  const secs = (ms) => `${Math.round(number(ms) / 1000)}s`;
  const rows = [
    ["Task", `\`${summary.taskId}\``],
    ["Harness", summary.harnessVersion ?? "unknown"],
    ["Tier", summary.tier ?? "—"],
    ...(summary.profile ? [["Profile", summary.profile]] : []),
    ...(summary.lane ? [["Lane", summary.lane]] : []),
    ["Tokens (implementer)", fmtTokens(summary.tokens?.implementer)],
    ["Tokens (reviewer)", fmtTokens(summary.tokens?.reviewer)],
    [
      "Model calls",
      `implementer ${number(summary.modelCalls?.implementer)} / reviewer ${number(summary.modelCalls?.reviewer)}`,
    ],
    ["Runner commands", number(summary.runnerCommands)],
    ["Transitions", number(summary.transitions)],
    ["Review rounds", number(summary.reviewRounds)],
    ["CI fix rounds (current)", number(summary.ciFixRounds)],
    ["CI failures (total)", number(summary.ciFailures)],
    [
      "Verify duration",
      ["lint", "unit", "build", "process"]
        .map((kind) => `${kind} ${secs(summary.verifyDurationMs?.[kind])}`)
        .join(" / "),
    ],
    ["CLI output", `${number(summary.cliOutputBytes)} bytes`],
    ["Friction notes", number(summary.frictionNotes)],
  ];
  const table = rows.map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  return [
    metricsCommentMarker(summary.taskId),
    "**Agent metrics summary**",
    "",
    "| metric | value |",
    "|---|---|",
    table,
    "",
    "<details>",
    "<summary>metrics JSON</summary>",
    "",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
    "</details>",
    "",
  ].join("\n");
}

/** Parse the summary JSON out of a marked comment body; null when absent/broken. */
export function extractMetricsSummary(body) {
  if (typeof body !== "string" || !body.includes(METRICS_MARKER_PREFIX)) return null;
  const match = body.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed?.schema === SUMMARY_SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

// CLI entry stays last: consts above must be initialized before run() executes.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run(parseArguments(process.argv.slice(2)));
    // summary-json keeps stdout as a single JSONL record so it can be piped
    // straight into collect-harness-metrics consumers.
    if (result?.summary) console.log(JSON.stringify(result.summary));
    else console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
