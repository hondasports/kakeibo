import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyChangedFiles } from "./classify-e2e-relevance.mjs";
import { isContentTarget, machineRiskForChange, readChangedHunks } from "./machine-risk.mjs";
import { assessReviewDepth, REVIEW_TIERS } from "./review-depth.mjs";
import { readChangedPaths, resolvePrBase, suggestSkillsForChange } from "./suggest-skills.mjs";

/** Return the ordering index for a review tier. */
const tierIndex = (tier) => REVIEW_TIERS.indexOf(tier);
/** Return the highest review tier from the provided candidates. */
const highestTier = (...tiers) =>
  tiers.filter(Boolean).sort((a, b) => tierIndex(b) - tierIndex(a))[0] ?? "T1";

/** Assess changed paths and combine machine, predicted, and agent review floors. */
export function assessChange({
  paths = [],
  hunks = {},
  diffFailed = false,
  predictedRisk = "T1",
  agentAssessment = null,
  reviewerAssessment = null,
} = {}) {
  const classification = classifyChangedFiles(paths);
  const machine = machineRiskForChange({ paths, hunks, diffFailed });
  const skillResult = suggestSkillsForChange({ changedPaths: paths, hunks, diffFailed });
  const agent = agentAssessment ? assessReviewDepth(agentAssessment) : null;
  const reviewer = reviewerAssessment ? assessReviewDepth(reviewerAssessment) : null;
  const finalTier = highestTier(
    predictedRisk,
    machine.minimumTier,
    agent?.applied_tier,
    reviewer?.applied_tier,
  );
  const uncertainty = agentAssessment?.risk_assessment?.uncertainty;
  const independent =
    finalTier === "T3" ||
    (finalTier === "T2" &&
      (!agentAssessment ||
        uncertainty === "some_unknowns" ||
        reviewerAssessment?.risk_assessment?.uncertainty === "some_unknowns"));
  // Thorough verification (what profiles used to encode) is derived from the
  // assessment inputs: a T3 change, or an assessment signalling unknowns or a
  // system-wide blast radius, needs lint/unit/build even on non-runtime paths.
  const thorough =
    finalTier === "T3" ||
    [agentAssessment, reviewerAssessment].some(
      (assessment) =>
        assessment &&
        (assessment.risk_assessment?.uncertainty !== "known_pattern" ||
          assessment.risk_assessment?.blast_radius === "shared_or_system_wide"),
    );
  const verification =
    classification.runtimeRelevant || thorough
      ? { process: true, lint: true, unit: true, build: true, e2e: classification.runtimeRelevant }
      : { process: true, lint: false, unit: false, build: false, e2e: false };

  return {
    risk: {
      predicted: predictedRisk,
      machine: machine.minimumTier,
      machineFloorTriggers: machine.floorTriggers,
      machineFloorTriggerDetails: machine.floorTriggerDetails,
      agent: agent?.applied_tier ?? null,
      reviewer: reviewer?.applied_tier ?? null,
      final: finalTier,
    },
    requiredSkills: skillResult.suggestions.map((item) => item.skill),
    verification,
    thorough,
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
  const out = { predictedRisk: "T1", agentAssessment: null };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--paths") {
      out.paths = readOptionValue(args, index, arg).split(",").filter(Boolean);
      index += 1;
    } else if (arg === "--base") {
      out.base = readOptionValue(args, index, arg);
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
    const args = parseArguments(process.argv.slice(2));
    const paths = args.paths ?? readChangedPaths({ base: args.base });
    // Content rules need the diff; a read failure fails closed to T3 (AC5).
    // With explicit --paths and no base there is no diff to read, and paths
    // outside the content targets cannot hide dangerous symbols anyway.
    let hunks = {};
    let diffFailed = false;
    if ((args.base || !args.paths) && paths.some(isContentTarget)) {
      try {
        const base = args.base ?? resolvePrBase();
        hunks = readChangedHunks({ base, paths });
      } catch {
        diffFailed = true;
      }
    }
    const result = assessChange({ ...args, paths, hunks, diffFailed });
    if (args.paths && !args.base && paths.some(isContentTarget)) {
      result.warning =
        "--paths without --base skips the hunk read, so content rules were not evaluated; pass --base to include them";
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
