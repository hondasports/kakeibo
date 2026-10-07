import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  extractMetricsSummary,
  metricsCommentMarker,
  renderMetricsComment,
  run as metricsRun,
  summarizeTask,
} from "./loop-metrics.mjs";
import {
  aggregateTable,
  collectSummaries,
  recordsFromJsonl,
  renderTable,
  run as collectRun,
} from "./collect-harness-metrics.mjs";
import { publishTaskMetrics, run as runnerRun } from "./loop-runner.mjs";
import { taskFixture } from "./loop-test-fixtures.mjs";

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.AGENT_METRICS_FILE;
});

const mkdtemp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "metrics-publish-"));
  dirs.push(dir);
  return dir;
};

const entry = (fields) => ({ at: "2026-01-01T00:00:00.000Z", taskId: "t1", ...fields });

const fixtureEntries = [
  entry({ action: "transition", event: "ready" }),
  entry({ action: "transition", event: "findings" }),
  entry({ action: "transition", event: "ci_failure" }),
  entry({ action: "transition", event: "ci_failure" }),
  entry({ action: "cli_output", command: "--verify-required", outputBytes: 500 }),
  entry({ action: "cli_output", command: "--review", outputBytes: 300 }),
  entry({ action: "verify", kind: "lint", result: "pass", durationMs: 4000 }),
  entry({ action: "verify", kind: "unit", result: "pass", durationMs: 30000 }),
  entry({ action: "verify", kind: "process", result: "pass", durationMs: 9000 }),
  entry({ action: "friction_note", note: "test" }),
  entry({
    action: "usage",
    role: "implementer",
    source: "a.jsonl",
    sourceId: "s1",
    calls: 4,
    inputUncached: 1000,
    cacheRead: 800,
    cacheWrite: 200,
    output: 300,
    reasoning: 100,
  }),
  entry({
    action: "usage",
    role: "reviewer",
    source: "b.jsonl",
    sourceId: "s2",
    calls: 2,
    inputUncached: 500,
    cacheRead: 100,
    cacheWrite: 0,
    output: 80,
    reasoning: 20,
  }),
  // A different task's noise must never leak into the summary.
  { at: "2026-01-01T00:00:00.000Z", taskId: "other", action: "transition", event: "ci_failure" },
];

const context = (overrides = {}) => ({
  tier: "T3",
  profile: "deep",
  harnessVersion: "1+abcdef012345",
  ciFixRounds: 0,
  ...overrides,
});

describe("summarizeTask", () => {
  it("builds the agent-metrics-summary/v1 shape with all counters", () => {
    const summary = summarizeTask(fixtureEntries, "t1", context());
    expect(summary.schema).toBe("agent-metrics-summary/v1");
    expect(summary.taskId).toBe("t1");
    expect(summary.harnessVersion).toBe("1+abcdef012345");
    expect(summary.tier).toBe("T3");
    expect(summary.profile).toBe("deep");
    expect(summary.tokens.implementer).toEqual({
      input: 1200,
      cachedInput: 800,
      output: 400,
    });
    expect(summary.tokens.reviewer).toEqual({ input: 500, cachedInput: 100, output: 100 });
    expect(summary.modelCalls).toEqual({ implementer: 4, reviewer: 2 });
    expect(summary.runnerCommands).toBe(2);
    expect(summary.transitions).toBe(4);
    expect(summary.reviewRounds).toBe(1);
    // AC7: two ci_failure transitions, even though the current counter is 0.
    expect(summary.ciFailures).toBe(2);
    expect(summary.ciFixRounds).toBe(0);
    expect(summary.verifyDurationMs).toEqual({
      lint: 4000,
      unit: 30000,
      build: 0,
      process: 9000,
    });
    expect(summary.cliOutputBytes).toBe(800);
    expect(summary.frictionNotes).toBe(1);
  });

  it("omits profile/lane keys when the task state has none (AC6)", () => {
    const summary = summarizeTask(fixtureEntries, "t1", {
      tier: "T1",
      harnessVersion: "1+x",
    });
    expect(summary).not.toHaveProperty("profile");
    expect(summary).not.toHaveProperty("lane");
    expect(summary.tier).toBe("T1");
  });

  it("defaults ciFixRounds to the ci_failure transition count without task state", () => {
    const summary = summarizeTask(fixtureEntries, "t1", { tier: "T1" });
    expect(summary.ciFixRounds).toBe(2);
  });

  it("emits an empty-but-valid summary for an unknown task", () => {
    const summary = summarizeTask(fixtureEntries, "nope", context());
    expect(summary.transitions).toBe(0);
    expect(summary.runnerCommands).toBe(0);
    expect(summary.tokens.implementer).toEqual({ input: 0, cachedInput: 0, output: 0 });
  });
});

describe("metrics comment rendering", () => {
  it("round-trips the summary through render+extract (AC8 base)", () => {
    const summary = summarizeTask(fixtureEntries, "t1", context());
    const body = renderMetricsComment(summary);
    expect(body).toContain(metricsCommentMarker("t1"));
    expect(extractMetricsSummary(body)).toEqual(summary);
  });

  it("extract ignores unmarked or malformed comment bodies", () => {
    expect(extractMetricsSummary("plain comment")).toBeNull();
    expect(extractMetricsSummary(`${metricsCommentMarker("t1")} no json here`)).toBeNull();
    expect(
      extractMetricsSummary(
        `${metricsCommentMarker("t1")}\n<details>\n\`\`\`json\n{"schema":"other"}\n\`\`\`\n</details>`,
      ),
    ).toBeNull();
  });

  it("never leaks absolute paths, env values, or transcript text (AC2)", () => {
    process.env.SENTINEL_SECRET_942 = "sekret-value-942";
    const summary = summarizeTask(fixtureEntries, "t1", context());
    const body = renderMetricsComment(summary);
    expect(body).not.toMatch(/\/(home|Users|var|tmp|private|opt|mnt|root)\//);
    expect(body).not.toContain("sekret-value-942");
    expect(body).not.toMatch(/^[A-Z_]{4,}=.+/m);
    // The JSON block itself must stay a pure whitelist of counters.
    const json = extractMetricsSummary(body);
    expect(Object.keys(json).sort()).toEqual(
      [
        "schema",
        "taskId",
        "harnessVersion",
        "tier",
        "profile",
        "tokens",
        "modelCalls",
        "runnerCommands",
        "transitions",
        "reviewRounds",
        "ciFixRounds",
        "ciFailures",
        "verifyDurationMs",
        "cliOutputBytes",
        "frictionNotes",
      ].sort(),
    );
  });
});

describe("publishTaskMetrics", () => {
  const task = taskFixture(process.cwd(), { state: "done", taskId: "t1" });

  it("creates a comment when none carries the marker", () => {
    const calls = [];
    const gh = (args) => {
      calls.push(args.join(" "));
      if (args.join(" ").includes("comments?per_page")) return "[]";
      return JSON.stringify({ html_url: "https://example.test/c/1" });
    };
    const result = publishTaskMetrics(task, "5", process.cwd(), {
      gh,
      repoView: () => ({ owner: { login: "o" }, name: "r" }),
    });
    expect(result.published).toBe("created");
    const post = calls.find((call) => call.includes("/issues/5/comments") && !call.includes("?"));
    expect(post).toContain("body=<!-- agent-metrics:v1 task=t1 -->");
  });

  it("updates the existing marked comment instead of duplicating (AC1)", () => {
    const calls = [];
    const gh = (args) => {
      calls.push(args.join(" "));
      if (args.join(" ").includes("comments?per_page"))
        return JSON.stringify([
          { id: 11, body: `${metricsCommentMarker("other-task")}\nold` },
          { id: 42, body: `${metricsCommentMarker("t1")}\nold` },
        ]);
      return JSON.stringify({ html_url: "https://example.test/c/42" });
    };
    const result = publishTaskMetrics(task, "5", process.cwd(), {
      gh,
      repoView: () => ({ owner: { login: "o" }, name: "r" }),
    });
    expect(result.published).toBe("updated");
    const patch = calls.find((call) => call.includes("PATCH"));
    expect(patch).toContain("/issues/comments/42");
    expect(patch).toContain("body=<!-- agent-metrics:v1 task=t1 -->");
  });

  it("refuses outside aftercare/done", () => {
    const running = taskFixture(process.cwd(), { state: "execute", taskId: "t1" });
    expect(() => publishTaskMetrics(running, "5", process.cwd())).toThrow(/aftercare or done/);
  });
});

/** Minimal real repo: .agent config + a task file + a metrics log. */
function miniRepository(state = "done") {
  const dir = mkdtemp();
  cpSync(path.join(process.cwd(), ".agent"), path.join(dir, ".agent"), { recursive: true });
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  writeFileSync(path.join(dir, "scripts", "loop-runner.mjs"), "// stub\n");
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git(["init", "-b", "preview"]);
  git(["config", "user.email", "test@example.invalid"]);
  git(["config", "user.name", "Test"]);
  git(["add", "."]);
  git(["-c", "core.hooksPath=/dev/null", "commit", "-m", "base"]);
  const taskFile = git(["rev-parse", "--path-format=absolute", "--git-path", "agent-task.json"]);
  writeFileSync(taskFile, JSON.stringify(taskFixture(dir, { state, taskId: "t1" })));
  const metricsFile = path.join(dir, "metrics.jsonl");
  writeFileSync(metricsFile, fixtureEntries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  process.env.AGENT_METRICS_FILE = metricsFile;
  return { dir, taskFile, metricsFile };
}

describe("--publish-metrics CLI", () => {
  it("does not update the task state file (AC4)", () => {
    const { dir, taskFile } = miniRepository();
    const before = readFileSync(taskFile, "utf8");
    const gh = (args) =>
      args.join(" ").includes("comments?per_page") ? "[]" : JSON.stringify({ html_url: "u" });
    const result = runnerRun({ "publish-metrics": "9" }, dir, {
      gh,
      repoView: () => ({ owner: { login: "o" }, name: "r" }),
    });
    expect(result.published).toBe("created");
    expect(readFileSync(taskFile, "utf8")).toBe(before);
  });

  it("summary-json format emits one record identical to a collected one (AC8)", () => {
    const { dir, metricsFile } = miniRepository();
    const { summary } = metricsRun({ task: "t1", format: "summary-json" }, dir);
    expect(summary.schema).toBe("agent-metrics-summary/v1");
    expect(summary.taskId).toBe("t1");
    expect(summary.tier).toBe("T1"); // taskFixture retains its predicted risk
    // The same record survives comment round-trip and JSONL collection.
    const body = renderMetricsComment(summary);
    const fromComment = extractMetricsSummary(body);
    const { records } = recordsFromJsonl(`${JSON.stringify(fromComment)}\n`);
    expect(records[0]).toEqual(summary);
    // --out appends a JSONL line collect can consume.
    const outFile = path.join(dir, "out.jsonl");
    metricsRun({ task: "t1", format: "summary-json", out: outFile }, dir);
    const { records: appended } = recordsFromJsonl(readFileSync(outFile, "utf8"));
    expect(appended).toHaveLength(1);
    expect(appended[0]).toEqual(summary);
    expect(existsSync(metricsFile)).toBe(true);
  });
});

describe("collect-harness-metrics", () => {
  const summaryFor = (taskId) => summarizeTask(fixtureEntries, taskId, context());

  it("collects only marked comments and reports skipped malformed ones (AC3)", () => {
    const good = { id: 1, body: renderMetricsComment(summaryFor("a")) };
    const broken = {
      id: 2,
      body: `${metricsCommentMarker("b")}\n<details>\n\`\`\`json\n{oops\n\`\`\`\n</details>`,
    };
    const plain = { id: 3, body: "no marker" };
    const gh = (args) => {
      const joined = args.join(" ");
      if (joined.includes("issues/7/comments")) return JSON.stringify([good, broken, plain]);
      return "[]";
    };
    const { records, skipped } = collectSummaries("o/r", [7], process.cwd(), { gh });
    expect(records).toHaveLength(1);
    expect(records[0].taskId).toBe("a");
    expect(skipped).toBe(1);
  });

  it("aggregates records lacking profile/lane without error (AC6)", () => {
    const bare = summaryFor("bare");
    delete bare.profile;
    bare.tier = "T2";
    const rows = aggregateTable([summaryFor("a"), bare]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.tasks === 1)).toBe(true);
    expect(renderTable(rows)).toContain("harnessVersion");
  });

  it("--format table groups by harnessVersion and tier", () => {
    const a = summaryFor("a");
    const b = { ...summaryFor("b"), transitions: 10, ciFailures: 1 };
    const comments = [a, b].map((s) => ({ body: renderMetricsComment(s) }));
    const gh = (args) => (args.join(" ").includes("comments") ? JSON.stringify(comments) : "[]");
    const { table, report } = collectRun({ repo: "o/r", pr: "1", format: "table" }, process.cwd(), {
      gh,
    });
    expect(report.collected).toBe(2);
    expect(table).toContain("| 1+abcdef012345 | T3 | 2 |");
  });

  it("recordsFromJsonl tolerates malformed lines and non-summary objects", () => {
    const summary = summarizeTask(fixtureEntries, "t1", { harnessVersion: "1+x" });
    const { records, skipped } = recordsFromJsonl(
      `${JSON.stringify(summary)}\nnot json\n\n{"a":1}\n[{"x":1}]\n`,
    );
    expect(records).toEqual([summary]);
    // broken JSON + non-summary object + array are all skipped (review f-5).
    expect(skipped).toBe(3);
  });
});
