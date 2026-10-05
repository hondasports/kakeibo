import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  aggregateMetrics,
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
    expect(aggregateMetrics([{ action: "verify" }]).usage).toBeUndefined();
  });
  it("honors AGENT_METRICS_FILE for the default log path", () => {
    expect(metricsLogPath(process.cwd(), { AGENT_METRICS_FILE: "/x/metrics.jsonl" })).toBe(
      "/x/metrics.jsonl",
    );
  });
});
