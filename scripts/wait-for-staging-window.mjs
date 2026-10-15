import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_WORKFLOW_FILE = "production-release.yml";
export const RELEASE_CANDIDATE_JOB_NAME = "Vercel release candidate E2E";

// 上限の根拠: 最悪ケースで「実行中 preview デプロイ(40m) + preflight(20m) +
// リリース候補E2E(40m)」≈ 100m。これに余裕を持たせて 120m。上限を超えた場合は
// ステージングへデプロイせず失敗する（中途半端な staging を作らない側に倒す）。
export const DEFAULT_TIMEOUT_MINUTES = 120;
export const DEFAULT_POLL_SECONDS = 30;

const RUNS_PER_PAGE = 50;
const JOBS_PER_PAGE = 100;
const MAX_CONSECUTIVE_FETCH_FAILURES = 3;

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * 完了していない run 状態はすべて「これから RC 区間へ進み得る」とみなす。
 * queued / in_progress / waiting / pending / requested を個別列挙するより
 * 「completed 以外」を待機対象にする方が、新しい状態が増えても安全側に倒れる。
 */
export function isActiveRunStatus(status) {
  return status !== "completed";
}

/**
 * run 一覧と run id → jobs 一覧から、ステージング窓が塞がっているかを判定する。
 * RC ジョブが「存在しない or 未完了」の active run が 1 件でもあれば待機。
 * RC 完了後（production 承認待ち / 本番デプロイ中）は staging を使わないので塞がない。
 */
export function evaluateRuns(runs, jobsByRunId) {
  const blockers = [];

  for (const run of runs ?? []) {
    if (!isActiveRunStatus(run.status)) continue;

    const jobs = jobsByRunId?.[run.id] ?? null;
    const rcJob = jobs?.find((entry) => entry.name === RELEASE_CANDIDATE_JOB_NAME) ?? null;

    if (!rcJob || rcJob.status !== "completed") {
      blockers.push({
        runId: run.id,
        runName: run.name ?? "",
        runStatus: run.status,
        jobStatus: rcJob ? rcJob.status : null,
      });
    }
  }

  return { decision: blockers.length > 0 ? "wait" : "clear", blockers };
}

function isFatalApiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /403|forbidden|resource not accessible|401|unauthorized/i.test(message);
}

function runGhApi(args, exec = execFileSync) {
  const output = exec("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(output);
}

/** production-release の active run と、各 run の jobs 一覧を取得する。 */
export function fetchStagingSnapshot(repo, exec = execFileSync) {
  const runsResponse = runGhApi(
    [
      "api",
      `repos/${repo}/actions/workflows/${RELEASE_WORKFLOW_FILE}/runs?per_page=${RUNS_PER_PAGE}`,
    ],
    exec,
  );
  const runs = runsResponse.workflow_runs ?? [];
  const activeRuns = runs.filter((run) => isActiveRunStatus(run.status));

  const jobsByRunId = {};
  for (const run of activeRuns) {
    const jobsResponse = runGhApi(
      ["api", `repos/${repo}/actions/runs/${run.id}/jobs?per_page=${JOBS_PER_PAGE}`],
      exec,
    );
    jobsByRunId[run.id] = jobsResponse.jobs ?? [];
  }

  return { runs, jobsByRunId };
}

/**
 * 窓が空くまで pollMs 間隔でポーリングする。timeoutMs を超えても塞がっている
 * 場合は { timedOut: true } を返す（呼び出し側がデプロイせず失敗させる）。
 */
export async function waitForStagingWindow({
  fetchSnapshot,
  timeoutMs,
  pollMs,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  log = console.log,
}) {
  const startedAt = now();
  let consecutiveFailures = 0;
  let polls = 0;
  let lastBlockers = [];

  for (;;) {
    polls += 1;
    const elapsedMs = now() - startedAt;

    let decision = null;
    try {
      const snapshot = await fetchSnapshot();
      consecutiveFailures = 0;
      const result = evaluateRuns(snapshot.runs, snapshot.jobsByRunId);
      decision = result.decision;
      lastBlockers = result.blockers;
    } catch (error) {
      consecutiveFailures += 1;
      if (isFatalApiError(error) || consecutiveFailures >= MAX_CONSECUTIVE_FETCH_FAILURES) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log(
        `[staging-window] snapshot fetch failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FETCH_FAILURES}): ${message}`,
      );
    }

    if (decision === "clear") {
      return { timedOut: false, polls, waitedMs: elapsedMs, blockers: [] };
    }

    if (elapsedMs >= timeoutMs) {
      return { timedOut: true, polls, waitedMs: elapsedMs, blockers: lastBlockers };
    }

    if (decision === "wait") {
      const blockersText = lastBlockers.map(formatBlocker).join(", ");
      log(
        `[staging-window] release candidate window active (${blockersText}); ` +
          `sleeping ${Math.round(pollMs / 1000)}s (elapsed ${(elapsedMs / 60_000).toFixed(1)}m/${Math.round(timeoutMs / 60_000)}m)`,
      );
    }

    await sleep(pollMs);
  }
}

export function parseArguments(args) {
  const options = {
    repo: process.env.GITHUB_REPOSITORY ?? "",
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    pollSeconds: DEFAULT_POLL_SECONDS,
    once: false,
  };

  const readPositiveInt = (value, flag) => {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== String(value)) {
      throw new Error(`${flag} requires a positive integer`);
    }
    return parsed;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--repo") {
      options.repo = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--timeout-minutes") {
      options.timeoutMinutes = readPositiveInt(args[index + 1], "--timeout-minutes");
      index += 1;
    } else if (arg === "--poll-seconds") {
      options.pollSeconds = readPositiveInt(args[index + 1], "--poll-seconds");
      index += 1;
    } else if (arg === "--once") {
      options.once = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!REPO_PATTERN.test(options.repo)) {
    throw new Error("--repo must be in owner/repo form (or set GITHUB_REPOSITORY)");
  }

  return options;
}

function formatBlocker(blocker) {
  const jobStatus = blocker.jobStatus ?? "not listed yet";
  return `run=${blocker.runId} (${blocker.runStatus}) rc_job=${jobStatus}`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const fetchSnapshot = () => fetchStagingSnapshot(options.repo);
  const timeoutMs = options.timeoutMinutes * 60_000;
  const pollMs = options.pollSeconds * 1_000;

  if (options.once) {
    const snapshot = await fetchSnapshot();
    const result = evaluateRuns(snapshot.runs, snapshot.jobsByRunId);
    if (result.decision === "clear") {
      console.log("[staging-window] clear: no active release candidate window");
      return;
    }
    console.log(`[staging-window] wait: ${result.blockers.map(formatBlocker).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[staging-window] watching ${RELEASE_WORKFLOW_FILE} for an active "${RELEASE_CANDIDATE_JOB_NAME}" window` +
      ` (timeout=${options.timeoutMinutes}m, poll=${options.pollSeconds}s)`,
  );

  const result = await waitForStagingWindow({
    fetchSnapshot,
    timeoutMs,
    pollMs,
    log: (message) => console.log(message),
  });

  const waitedMinutes = (result.waitedMs / 60_000).toFixed(1);
  if (result.timedOut) {
    console.error(
      `::error::staging window still blocked after ${options.timeoutMinutes}m ` +
        `(${result.blockers.map(formatBlocker).join(", ") || "unknown blocker"}). ` +
        "Not deploying to staging.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[staging-window] clear: proceeding to deploy (polls=${result.polls}, waited=${waitedMinutes}m)`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error("::error::staging-window wait failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
