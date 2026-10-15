import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  DEFAULT_POLL_SECONDS,
  DEFAULT_TIMEOUT_MINUTES,
  RELEASE_CANDIDATE_JOB_NAME,
  evaluateRuns,
  isActiveRunStatus,
  parseArguments,
  waitForStagingWindow,
} from "./wait-for-staging-window.mjs";

const PREVIEW_DEPLOY_WORKFLOW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.github/workflows/preview-deploy.yml",
);
const PRODUCTION_RELEASE_WORKFLOW_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.github/workflows/production-release.yml",
);

// anonymized fixtures shaped like the real REST API payloads
// (GET /actions/workflows/{file}/runs -> workflow_runs[], GET /actions/runs/{id}/jobs -> jobs[])
function releaseRun({
  id = 9001,
  status = "in_progress",
  name = "Production Release from main@aaa000",
} = {}) {
  return {
    id,
    name,
    status,
    conclusion: status === "completed" ? "success" : null,
    event: "push",
    head_branch: "main",
    workflow_id: 297597412,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function job({ name, status = "in_progress", conclusion = null }) {
  return {
    id: Math.abs(name.length * 2654435761) % 100000,
    name,
    status,
    conclusion,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: status === "completed" ? "2026-01-01T00:10:00Z" : null,
  };
}

function rcJob(status, conclusion = null) {
  return job({ name: RELEASE_CANDIDATE_JOB_NAME, status, conclusion });
}

describe("run status classification", () => {
  it("treats every non-completed run status as active (fail-safe)", () => {
    for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) {
      expect(isActiveRunStatus(status), status).toBe(true);
    }
    expect(isActiveRunStatus("completed")).toBe(false);
  });
});

describe("release candidate window decision", () => {
  it("is clear when there are no active production-release runs", () => {
    const runs = [
      releaseRun({ id: 1, status: "completed" }),
      releaseRun({ id: 2, status: "completed" }),
    ];
    const result = evaluateRuns(runs, {});
    expect(result.decision).toBe("clear");
    expect(result.blockers).toEqual([]);
  });

  it("is clear for an empty run list", () => {
    expect(evaluateRuns([], {}).decision).toBe("clear");
  });

  it.each(["queued", "in_progress", "waiting", "pending", "requested"])(
    "waits while an active run (%s) has the release candidate job incomplete",
    (status) => {
      const runs = [releaseRun({ id: 42, status })];
      const jobsByRunId = {
        42: [job({ name: "Production preflight", status: "completed" }), rcJob("queued")],
      };
      const result = evaluateRuns(runs, jobsByRunId);
      expect(result.decision).toBe("wait");
      expect(result.blockers).toEqual([
        { runId: 42, runName: runs[0].name, runStatus: status, jobStatus: "queued" },
      ]);
    },
  );

  it("waits when the release candidate job is not yet listed for an active run", () => {
    const runs = [releaseRun({ id: 7, status: "in_progress" })];
    // preflight still running: only its job is listed so far
    const result = evaluateRuns(runs, { 7: [job({ name: "Production preflight" })] });
    expect(result.decision).toBe("wait");
    expect(result.blockers[0]).toMatchObject({ runId: 7, jobStatus: null });
  });

  it("waits when the jobs list for an active run could not be fetched", () => {
    const runs = [releaseRun({ id: 8, status: "in_progress" })];
    const result = evaluateRuns(runs, {});
    expect(result.decision).toBe("wait");
    expect(result.blockers[0].jobStatus).toBeNull();
  });

  it("does not wait when the release candidate job completed and the run moved on", () => {
    // approval-waiting / production deploy in progress: staging is no longer used
    const runs = [releaseRun({ id: 9, status: "in_progress" })];
    const jobsByRunId = {
      9: [
        job({ name: "Production preflight", status: "completed" }),
        rcJob("completed", "success"),
        job({ name: "Deploy Production" }),
      ],
    };
    expect(evaluateRuns(runs, jobsByRunId).decision).toBe("clear");
  });

  it("does not wait when the release candidate job completed with a failure conclusion", () => {
    const runs = [releaseRun({ id: 10, status: "completed" })];
    const jobsByRunId = { 10: [rcJob("completed", "failure")] };
    expect(evaluateRuns(runs, jobsByRunId).decision).toBe("clear");
  });

  it("waits when any one of several active runs still uses the window", () => {
    const runs = [
      releaseRun({ id: 20, status: "in_progress", name: "Production Release A" }),
      releaseRun({ id: 21, status: "waiting", name: "Production Release B" }),
      releaseRun({ id: 22, status: "completed", name: "Production Release C" }),
    ];
    const jobsByRunId = {
      20: [rcJob("completed", "success")],
      21: [rcJob("in_progress")],
      22: [rcJob("completed", "success")],
    };
    const result = evaluateRuns(runs, jobsByRunId);
    expect(result.decision).toBe("wait");
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].runId).toBe(21);
  });

  it("handles workflow_dispatch runs the same way", () => {
    const run = releaseRun({ id: 30, status: "in_progress" });
    run.event = "workflow_dispatch";
    const result = evaluateRuns([run], { 30: [rcJob("in_progress")] });
    expect(result.decision).toBe("wait");
  });
});

describe("wait loop", () => {
  function fakeClock() {
    let nowMs = 0;
    return {
      now: () => nowMs,
      sleep: (ms) => {
        nowMs += ms;
        return Promise.resolve();
      },
    };
  }

  it("returns immediately when the window is already clear", async () => {
    const clock = fakeClock();
    const fetchSnapshot = vi.fn(async () => ({ runs: [], jobsByRunId: {} }));
    const result = await waitForStagingWindow({
      fetchSnapshot,
      timeoutMs: 120_000,
      pollMs: 30_000,
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    });
    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(1);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps polling until the window clears", async () => {
    const clock = fakeClock();
    const snapshots = [
      { runs: [releaseRun({ id: 1 })], jobsByRunId: { 1: [rcJob("in_progress")] } },
      { runs: [releaseRun({ id: 1 })], jobsByRunId: { 1: [rcJob("in_progress")] } },
      { runs: [releaseRun({ id: 1 })], jobsByRunId: { 1: [rcJob("completed", "success")] } },
    ];
    const fetchSnapshot = vi.fn(async () => snapshots.shift());
    const result = await waitForStagingWindow({
      fetchSnapshot,
      timeoutMs: 120_000,
      pollMs: 30_000,
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    });
    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(3);
    expect(result.waitedMs).toBe(60_000);
  });

  it("times out without proceeding when the window stays blocked", async () => {
    const clock = fakeClock();
    const fetchSnapshot = vi.fn(async () => ({
      runs: [releaseRun({ id: 1 })],
      jobsByRunId: { 1: [rcJob("in_progress")] },
    }));
    const result = await waitForStagingWindow({
      fetchSnapshot,
      timeoutMs: 90_000,
      pollMs: 30_000,
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    });
    expect(result.timedOut).toBe(true);
    expect(clock.now()).toBeGreaterThanOrEqual(90_000);
  });

  it("survives a transient fetch failure and keeps polling", async () => {
    const clock = fakeClock();
    let calls = 0;
    const fetchSnapshot = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("502 Bad Gateway");
      return { runs: [], jobsByRunId: {} };
    });
    const result = await waitForStagingWindow({
      fetchSnapshot,
      timeoutMs: 120_000,
      pollMs: 30_000,
      sleep: clock.sleep,
      now: clock.now,
      log: () => {},
    });
    expect(result.timedOut).toBe(false);
    expect(result.polls).toBe(2);
  });

  it("aborts immediately on a permission-style API failure", async () => {
    const clock = fakeClock();
    const fetchSnapshot = vi.fn(async () => {
      throw new Error("gh: Resource not accessible by integration (HTTP 403)");
    });
    await expect(
      waitForStagingWindow({
        fetchSnapshot,
        timeoutMs: 120_000,
        pollMs: 30_000,
        sleep: clock.sleep,
        now: clock.now,
        log: () => {},
      }),
    ).rejects.toThrow("Resource not accessible");
    expect(clock.now()).toBe(0);
  });

  it("aborts after repeated consecutive fetch failures", async () => {
    const clock = fakeClock();
    const fetchSnapshot = vi.fn(async () => {
      throw new Error("502 Bad Gateway");
    });
    await expect(
      waitForStagingWindow({
        fetchSnapshot,
        timeoutMs: 600_000,
        pollMs: 30_000,
        sleep: clock.sleep,
        now: clock.now,
        log: () => {},
      }),
    ).rejects.toThrow("502 Bad Gateway");
    expect(fetchSnapshot.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

describe("CLI argument parsing", () => {
  it("uses documented defaults and the Actions repository env", () => {
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
    const options = parseArguments([]);
    expect(options.repo).toBe("owner/repo");
    expect(options.timeoutMinutes).toBe(DEFAULT_TIMEOUT_MINUTES);
    expect(options.pollSeconds).toBe(DEFAULT_POLL_SECONDS);
    expect(options.once).toBe(false);
    vi.unstubAllEnvs();
  });

  it("accepts explicit timeout, poll, repo, and --once", () => {
    const options = parseArguments([
      "--repo",
      "owner/repo",
      "--timeout-minutes",
      "45",
      "--poll-seconds",
      "15",
      "--once",
    ]);
    expect(options).toMatchObject({
      repo: "owner/repo",
      timeoutMinutes: 45,
      pollSeconds: 15,
      once: true,
    });
  });

  it("rejects invalid values and unknown flags", () => {
    expect(() => parseArguments(["--timeout-minutes", "0"])).toThrow();
    expect(() => parseArguments(["--poll-seconds", "-5"])).toThrow();
    expect(() => parseArguments(["--repo", "no-slash"])).toThrow();
    expect(() => parseArguments(["--bogus"])).toThrow("unknown option");
  });
});

describe("preview-deploy workflow contract", () => {
  const workflowText = readFileSync(PREVIEW_DEPLOY_WORKFLOW_PATH, "utf8");
  const workflow = parseYaml(workflowText);

  it("runs a staging-window wait job before the deploy job", () => {
    const wait = workflow.jobs["wait-for-staging-window"];
    expect(wait).toBeDefined();
    expect(workflow.jobs.preview.needs).toBe("wait-for-staging-window");
    const waitSteps = wait.steps.map((step) => step.run ?? "");
    expect(waitSteps.join("\n")).toContain("wait-for-staging-window.mjs");
  });

  it("keeps the wait job outside the deploy concurrency group with actions: read", () => {
    const wait = workflow.jobs["wait-for-staging-window"];
    expect(wait.permissions).toMatchObject({ contents: "read", actions: "read" });
    // 待機ジョブは deploy グループに入れない。入ると待機中の preview push が
    // リリース候補E2Eの pending を押し出す。別グループで最新 run のみ待機。
    expect(wait.concurrency.group).not.toBe("preview-staging-deploy");
    expect(wait.concurrency["cancel-in-progress"]).toBe(true);
  });

  it("moves the staging concurrency group to the deploy job and stops cancelling in-progress work", () => {
    expect(workflow.concurrency).toBeUndefined();
    const preview = workflow.jobs.preview;
    expect(preview.concurrency).toMatchObject({
      group: "preview-staging-deploy",
      "cancel-in-progress": false,
    });
  });

  it("documents the wait timeout next to its value and grants the token only", () => {
    const wait = workflow.jobs["wait-for-staging-window"];
    const waitStep = wait.steps.find((step) =>
      (step.run ?? "").includes("wait-for-staging-window.mjs"),
    );
    expect(waitStep.run).toContain("--timeout-minutes");
    expect(waitStep.env).toMatchObject({ GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
  });
});

describe("production-release workflow contract (unchanged coupling)", () => {
  const workflow = parseYaml(readFileSync(PRODUCTION_RELEASE_WORKFLOW_PATH, "utf8"));

  it("keeps the release candidate job in the shared staging group without cancelling", () => {
    const rc = workflow.jobs["release-candidate"];
    expect(rc.name).toBe("Vercel release candidate E2E");
    expect(rc.concurrency).toMatchObject({
      group: "preview-staging-deploy",
      "cancel-in-progress": false,
    });
  });
});
