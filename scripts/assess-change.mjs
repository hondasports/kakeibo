import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyChangedFiles } from "./classify-e2e-relevance.mjs";
import { machineRiskForPaths } from "./machine-risk.mjs";
import { assessReviewDepth, REVIEW_TIERS } from "./review-depth.mjs";
import { suggestSkillsForPaths } from "./suggest-skills.mjs";

/** Return the ordering index for a review tier. */
const tierIndex = (tier) => REVIEW_TIERS.indexOf(tier);
/** Return the highest review tier from the provided candidates. */
const highestTier = (...tiers) =>
  tiers.filter(Boolean).sort((a, b) => tierIndex(b) - tierIndex(a))[0] ?? "T1";

/** Assess changed paths and combine machine, predicted, and agent review floors. */
export function assessChange({ paths = [], predictedRisk = "T1", agentAssessment = null } = {}) {
  const classification = classifyChangedFiles(paths);
  const machine = machineRiskForPaths(paths);
  const skillResult = suggestSkillsForPaths(paths);
  const agent = agentAssessment ? assessReviewDepth(agentAssessment) : null;
  const finalTier = highestTier(predictedRisk, machine.minimumTier, agent?.applied_tier);
  const uncertainty = agentAssessment?.risk_assessment?.uncertainty;
  const independent =
    finalTier === "T3" ||
    (finalTier === "T2" && (!agentAssessment || uncertainty === "some_unknowns"));
  const verification = classification.runtimeRelevant
    ? { process: true, lint: true, unit: true, build: true, e2e: true }
    : { process: true, lint: false, unit: false, build: false, e2e: false };

  return {
    risk: {
      predicted: predictedRisk,
      machine: machine.minimumTier,
      machineFloorTriggers: machine.floorTriggers,
      agent: agent?.applied_tier ?? null,
      final: finalTier,
    },
    requiredSkills: skillResult.suggestions.map((item) => item.skill),
    verification,
    review: { independent },
    runtimeRelevant: classification.runtimeRelevant,
  };
}

/** Read a required CLI option value without consuming another flag. */
function readOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

/** Parse CLI arguments for change assessment. */
export function parseArguments(args) {
  const out = { paths: [], predictedRisk: "T1", agentAssessment: null };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--paths") {
      out.paths = readOptionValue(args, index, arg).split(",").filter(Boolean);
      index += 1;
    } else if (arg === "--predicted-risk") {
      out.predictedRisk = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--agent-assessment") {
      out.agentAssessment = JSON.parse(readOptionValue(args, index, arg));
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!REVIEW_TIERS.includes(out.predictedRisk)) {
    throw new Error("predicted risk must be T1/T2/T3");
  }
  return out;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(assessChange(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
