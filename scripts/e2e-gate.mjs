import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASSING_E2E_RESULTS = new Set(["success", "skipped"]);

/** classifyがsuccessで、e2eがsuccess/skippedのときだけ通す。未知・欠落は失敗に倒す。 */
export function evaluateE2EGate({ classifyResult, e2eResult }) {
  if (classifyResult !== "success") {
    return {
      passed: false,
      reason: `classify の結果が ${classifyResult || "(未取得)"} のため、E2E の要否を判定できません`,
    };
  }
  if (!PASSING_E2E_RESULTS.has(e2eResult)) {
    return { passed: false, reason: `E2E job の結果が ${e2eResult || "(未取得)"} です` };
  }
  return {
    passed: true,
    reason:
      e2eResult === "skipped" ? "E2E は対象外（skipped）のため成功扱いです" : "E2E が成功しました",
  };
}

export function renderGateSummary({ classifyResult, e2eResult }, { passed, reason }) {
  return [
    "### E2E gate",
    `- result: \`${passed ? "pass" : "fail"}\``,
    `- classify: \`${classifyResult || "(未取得)"}\``,
    `- e2e: \`${e2eResult || "(未取得)"}\``,
    `- reason: ${reason}`,
    "",
  ].join("\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  const results = {
    classifyResult: process.env.CLASSIFY_RESULT,
    e2eResult: process.env.E2E_RESULT,
  };
  const verdict = evaluateE2EGate(results);
  const summary = renderGateSummary(results, verdict);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  process.exitCode = verdict.passed ? 0 : 1;
}
