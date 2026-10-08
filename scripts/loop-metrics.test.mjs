import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  aggregateMetrics,
  harnessVersion,
  metricsLogPath,
  parseArguments,
  readMetricsEntries,
  run,
} from "./loop-metrics.mjs";

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const entries = [
  {
    at: "2026-01-01T00:00:00.000Z",
    taskId: "t1",
    action: "verify",
    kind: "unit",
    result: "pass",
    scope: "affected",
    durationMs: 100,
  },
  {
    at: "2026-01-01T00:01:00.000Z",
    taskId: "t1",
    action: "verify",
    kind: "unit",
    result: "fail",
    scope: "full",
    durationMs: 200,
  },
  {
    at: "2026-01-01T00:02:00.000Z",
    taskId: "t2",
    action: "revision_changed",
    reused: 2,
    invalidated: 1,
  },
  { at: "2026-01-01T00:03:00.000Z", taskId: "t1", action: "transition", event: "findings" },
  { at: "2026-01-01T00:04:00.000Z", taskId: "t1", action: "transition", event: "ready" },
  {
    at: "2026-01-01T00:05:00.000Z",
    taskId: "t1",
    action: "watch_aftercare",
    polls: 5,
    ready: true,
  },
  { at: "2026-01-01T00:06:00.000Z", taskId: "t1", action: "friction_note" },
];

describe("agent metrics aggregation", () => {
  it("aggregates counts, durations, scopes and reuse totals per action", () => {
    const result = aggregateMetrics(entries);
    expect(result.entries).toBe(7);
    expect(result.tasks).toEqual(["t1", "t2"]);
    expect(result.actions.verify).toMatchObject({ count: 2, durationMs: 300 });
    expect(result.actions.verify.byKind.unit).toMatchObject({
      count: 2,
      pass: 1,
      fail: 1,
      durationMs: 300,
    });
    expect(result.actions.verify.byScope).toEqual({ affected: 1, full: 1 });
    expect(result.actions.revision_changed).toMatchObject({
      count: 1,
      reused: 2,
      invalidated: 1,
    });
    expect(result.actions.transition.events).toEqual({ findings: 1, ready: 1 });
    expect(result.actions.watch_aftercare).toMatchObject({ polls: 5, ready: 1 });
    expect(result.actions.friction_note.count).toBe(1);
  });
  it("filters by task id", () => {
    const result = aggregateMetrics(entries, { taskId: "t2" });
    expect(result.entries).toBe(1);
    expect(result.tasks).toEqual(["t2"]);
    expect(result.actions.verify).toBeUndefined();
  });
  it("reads JSONL files and honors --path/--task overrides", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "loop-metrics-"));
    dirs.push(dir);
    const file = path.join(dir, "agent-metrics.jsonl");
    writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    const result = run({ path: file, task: "t1" }, dir);
    expect(result.entries).toBe(6);
    expect(result.source).toBe(file);
    expect(readMetricsEntries(path.join(dir, "missing.jsonl"))).toEqual({
      entries: [],
      parseErrors: 0,
    });
    expect(() => parseArguments(["--bogus"])).toThrow("unknown option");
    expect(() => parseArguments(["--task"])).toThrow("requires a value");
    expect(parseArguments(["--", "--task", "t1"])).toEqual({ task: "t1" });
  });
  it("skips malformed lines and actionless entries instead of failing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "loop-metrics-bad-"));
    dirs.push(dir);
    const file = path.join(dir, "agent-metrics.jsonl");
    writeFileSync(
      file,
      [
        JSON.stringify(entries[0]),
        '{"taskId":"t1","action":"verify"', // torn append
        JSON.stringify({ taskId: "t1" }), // no action field
        JSON.stringify(entries[3]),
        "",
      ].join("\n"),
    );
    const result = run({ path: file }, dir);
    expect(result.parseErrors).toBe(1);
    expect(result.entries).toBe(3);
    expect(result.actions.verify.count).toBe(1);
    expect(result.actions.transition.events).toEqual({ findings: 1 });
    expect(result.actions.undefined).toBeUndefined();
  });
  it("treats non-object JSON values as parse errors", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "loop-metrics-scalar-"));
    dirs.push(dir);
    const file = path.join(dir, "agent-metrics.jsonl");
    writeFileSync(file, ["null", "[1,2]", "42", '"x"', JSON.stringify(entries[0])].join("\n"));
    const result = run({ path: file }, dir);
    expect(result.parseErrors).toBe(4);
    expect(result.entries).toBe(1);
  });
  it("keeps untrusted JSONL keys off shared prototypes", () => {
    const result = aggregateMetrics([
      { taskId: "t1", action: "__proto__" },
      { taskId: "t1", action: "verify", kind: "__proto__", result: "pass", scope: "full" },
      { taskId: "t1", action: "transition", event: "__proto__" },
    ]);
    expect(result.actions["__proto__"]).toEqual({ count: 1 });
    expect(result.actions.verify.byKind["__proto__"].count).toBe(1);
    expect(result.actions.transition.events["__proto__"]).toBe(1);
    expect(Object.prototype.count).toBeUndefined();
  });
  it("aggregates token usage per role from the latest record of each transcript", () => {
    const usage = (source, role, output, calls = 1) => ({
      taskId: "t",
      action: "usage",
      source,
      role,
      calls,
      inputUncached: 1,
      cacheRead: 10,
      cacheWrite: 2,
      output,
      reasoning: 0,
    });
    const result = aggregateMetrics([
      usage("impl.jsonl", "implementer", 5),
      usage("impl.jsonl", "implementer", 9, 3),
      usage("review.jsonl", "reviewer", 4),
      {
        taskId: "t",
        action: "revision_changed",
        reused: 1,
        invalidated: 2,
        assessmentCarried: true,
      },
      { taskId: "t", action: "review_packet", files: 5, scope: "increment" },
    ]);
    expect(result.usage.transcripts).toBe(2);
    expect(result.usage.byRole.implementer).toMatchObject({ calls: 3, output: 9 });
    expect(result.usage.byRole.reviewer).toMatchObject({ calls: 1, output: 4 });
    expect(result.usage.total).toMatchObject({ calls: 4, output: 13, cacheRead: 20 });
    expect(result.actions.revision_changed.assessmentCarried).toBe(1);
    expect(result.actions.review_packet.byScope.increment).toBe(1);
    // Same basename in different directories stays two transcripts.
    const twins = aggregateMetrics([
      { ...usage("session.jsonl", "reviewer", 3), sourceId: "aaaa" },
      { ...usage("session.jsonl", "reviewer", 4), sourceId: "bbbb" },
    ]);
    expect(twins.usage.transcripts).toBe(2);
    expect(twins.usage.byRole.reviewer.output).toBe(7);
    expect(aggregateMetrics([{ action: "verify" }]).usage).toBeUndefined();
  });
  it("aggregates cli_output sizes per command", () => {
    const result = aggregateMetrics([
      { taskId: "t1", action: "cli_output", command: "status", outputBytes: 400, exit: 0 },
      { taskId: "t1", action: "cli_output", command: "status", outputBytes: 800, exit: 0 },
      { taskId: "t1", action: "cli_output", command: "export", outputBytes: 9500, exit: 0 },
      {
        taskId: "t1",
        action: "cli_output",
        command: "check-pr+watch-aftercare",
        outputBytes: 30000,
        exit: 0,
      },
      { taskId: "t1", action: "cli_output", outputBytes: 20, exit: 1 },
      // Malformed/hand-edited line without a size must not drag the average down.
      { taskId: "t1", action: "cli_output", command: "status", exit: 0 },
    ]);
    expect(result.actions.cli_output.count).toBe(6);
    expect(result.actions.cli_output.byCommand.status).toEqual({
      count: 2,
      outputBytes: { total: 1200, avg: 600, max: 800 },
    });
    expect(result.actions.cli_output.byCommand.export).toEqual({
      count: 1,
      outputBytes: { total: 9500, avg: 9500, max: 9500 },
    });
    expect(result.actions.cli_output.byCommand["check-pr+watch-aftercare"].outputBytes).toEqual({
      total: 30000,
      avg: 30000,
      max: 30000,
    });
    expect(result.actions.cli_output.byCommand.unknown).toEqual({
      count: 1,
      outputBytes: { total: 20, avg: 20, max: 20 },
    });
  });
  it("honors AGENT_METRICS_FILE for the default log path", () => {
    expect(metricsLogPath(process.cwd(), { AGENT_METRICS_FILE: "/x/metrics.jsonl" })).toBe(
      "/x/metrics.jsonl",
    );
  });
});

describe("harnessVersion (#953 split coverage)", () => {
  it("fingerprints loop-runner plus every scripts/loop/*.mjs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "loop-metrics-version-"));
    dirs.push(dir);
    const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git(["init", "-b", "main"]);
    mkdirSync(path.join(dir, ".agent"), { recursive: true });
    writeFileSync(path.join(dir, ".agent", "process.yaml"), "version: 9\n");
    mkdirSync(path.join(dir, "scripts", "loop"), { recursive: true });
    writeFileSync(path.join(dir, "scripts", "loop-runner.mjs"), "export {}\n");
    writeFileSync(path.join(dir, "scripts", "loop", "state.mjs"), "export const a = 1;\n");

    const before = harnessVersion(dir);
    expect(before).toMatch(/^9\+[0-9a-f]{12}$/);
    // An edit inside scripts/loop/ must move the fingerprint even when
    // loop-runner.mjs itself is unchanged (F2).
    writeFileSync(path.join(dir, "scripts", "loop", "state.mjs"), "export const a = 2;\n");
    expect(harnessVersion(dir)).not.toBe(before);
  });
});
