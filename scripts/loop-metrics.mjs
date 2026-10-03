import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Shared metrics sink written by recordMetric in loop-runner.mjs. */
export function metricsLogPath(root = process.cwd()) {
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
    }
    if (entry.action === "transition") {
      action.events ??= Object.create(null);
      bump(action.events, entry.event);
    }
    if (entry.action === "watch_aftercare") {
      action.polls = (action.polls ?? 0) + (entry.polls ?? 0);
      if (entry.ready === true) action.ready = (action.ready ?? 0) + 1;
    }
  }
  return {
    entries: filtered.length,
    tasks: [...new Set(filtered.map((entry) => entry.taskId).filter(Boolean))],
    actions,
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
