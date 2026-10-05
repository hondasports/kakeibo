import { existsSync, readFileSync } from "node:fs";
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
      command.count += 1;
      if (typeof entry.outputBytes === "number") {
        command.outputBytes.total += entry.outputBytes;
        command.outputBytes.max = Math.max(command.outputBytes.max, entry.outputBytes);
      }
      command.outputBytes.avg = Math.round(command.outputBytes.total / command.count);
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
  const options = new Set(["--path", "--task"]);
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

export function run(args, cwd = process.cwd()) {
  const file = args.path ?? metricsLogPath(cwd);
  const { entries, parseErrors } = readMetricsEntries(file);
  return {
    source: file,
    parseErrors,
    ...aggregateMetrics(entries, { taskId: args.task ?? null }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(run(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
