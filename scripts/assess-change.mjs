import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChangedFiles } from "./classify-e2e-relevance.mjs";
import { machineRiskForPaths } from "./machine-risk.mjs";
import { assessReviewDepth, REVIEW_TIERS } from "./review-depth.mjs";
import { suggestSkillsForPaths } from "./suggest-skills.mjs";

const tierIndex = (tier) => REVIEW_TIERS.indexOf(tier);
const highestTier = (...tiers) => tiers.filter(Boolean).sort((a, b) => tierIndex(b) - tierIndex(a))[0] ?? "T1";

export function assessChange({ paths = [], predictedRisk = "T1", agentAssessment = null } = {}) {
  const classification = classifyChangedFiles(paths);
  const machine = machineRiskForPaths(paths);
  const skillResult = suggestSkillsForPaths(paths);
  const agent = agentAssessment ? assessReviewDepth(agentAssessment) : null;
  const finalTier = highestTier(predictedRisk, machine.minimumTier, agent?.applied_tier);
  const uncertainty = agentAssessment?.risk_assessment?.uncertainty;
  const independent = finalTier === "T3" || (finalTier === "T2" && uncertainty === "some_unknowns");
  const verification = classification.runtimeRelevant
    ? { process: true, lint: true, unit: true, build: true, e2e: true }
    : { process: true, lint: false, unit: false, build: false, e2e: false };
  return {
    risk: { predicted: predictedRisk, machine: machine.minimumTier, machineFloorTriggers: machine.floorTriggers, agent: agent?.applied_tier ?? null, final: finalTier },
    requiredSkills: skillResult.suggestions.map((item) => item.skill),
    verification, review: { independent }, runtimeRelevant: classification.runtimeRelevant,
  };
}

function parseArgs(args) {
  const out = { paths: [], predictedRisk: "T1", agentAssessment: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--paths") out.paths = String(args[++i] ?? "").split(",").filter(Boolean);
    else if (args[i] === "--predicted-risk") out.predictedRisk = args[++i] ?? "T1";
    else if (args[i] === "--agent-assessment") out.agentAssessment = JSON.parse(args[++i] ?? "null");
    else throw new Error(`unknown option: ${args[i]}`);
  }
  if (!REVIEW_TIERS.includes(out.predictedRisk)) throw new Error("predicted risk must be T1/T2/T3");
  return out;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(assessChange(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
