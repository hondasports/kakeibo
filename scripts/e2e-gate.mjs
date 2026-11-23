import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASSING_E2E_RESULTS = new Set(["success", "skipped"]);

const E2E_JOB_PREFIX = "E2E (Playwright / Chromium / ";

/**
 * classifyがsuccessで、e2eがskipped、またはmatrixの各jobがすべてsuccessのときだけ通す。
 * needs.e2e.result はmatrix全体で1つのため、片方だけ再実行した場合に成功へ倒れうる。
 * そのため最新attemptのjob一覧（jobs）も照合し、未取得・0件・未知の値は失敗に倒す。
 */
export function evaluateE2EGate({ classifyResult, e2eResult, jobs }) {
  if (classifyResult !== "success") {
    return {
      passed: false,
      reason: `classify の結果が ${classifyResult || "(未取得)"} のため、E2E の要否を判定できません`,
    };
  }
  if (e2eResult === "skipped") {
    return { passed: true, reason: "E2E は対象外（skipped）のため成功扱いです" };
  }
  if (e2eResult !== "success") {
    return { passed: false, reason: `E2E job の結果が ${e2eResult || "(未取得)"} です` };
  }
  if (!Array.isArray(jobs)) {
    return { passed: false, reason: "E2E job の一覧を取得できないため、成功を確認できません" };
  }
  const e2eJobs = jobs.filter((job) => String(job?.name).startsWith(E2E_JOB_PREFIX));
  if (e2eJobs.length === 0) {
    return { passed: false, reason: "E2E job が一覧に見つからないため、成功を確認できません" };
  }
  const notSuccess = e2eJobs.filter((job) => job.conclusion !== "success");
  if (notSuccess.length > 0) {
    const detail = notSuccess.map((job) => `${job.name}: ${job.conclusion ?? "(未確定)"}`);
    return { passed: false, reason: `成功していない E2E job があります（${detail.join(", ")}）` };
  }
  return { passed: true, reason: "すべての E2E job が成功しました" };
}

/** `gh api ... --jq '.jobs[] | {name, conclusion}'` が出力する1行1JSONを読む。失敗時はundefined。 */
export function readJobsFile(filePath) {
  if (!filePath) return undefined;
  try {
    return readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch {
    return undefined;
  }
}

export function renderGateSummary({ classifyResult, e2eResult, jobs }, { passed, reason }) {
  const jobLines = Array.isArray(jobs)
    ? jobs
        .filter((job) => String(job?.name).startsWith(E2E_JOB_PREFIX))
        .map((job) => `  - ${job.name}: \`${job.conclusion ?? "(未確定)"}\``)
    : [];
  return [
    "### E2E gate",
    `- result: \`${passed ? "pass" : "fail"}\``,
    `- classify: \`${classifyResult || "(未取得)"}\``,
    `- e2e: \`${e2eResult || "(未取得)"}\``,
    ...jobLines,
    `- reason: ${reason}`,
    "",
  ].join("\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  const results = {
    classifyResult: process.env.CLASSIFY_RESULT,
    e2eResult: process.env.E2E_RESULT,
    jobs: readJobsFile(process.env.E2E_JOBS_FILE),
  };
  const verdict = evaluateE2EGate(results);
  const summary = renderGateSummary(results, verdict);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  process.exitCode = verdict.passed ? 0 : 1;
}
