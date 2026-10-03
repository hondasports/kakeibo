import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { REVIEW_AXES, VERIFICATION_LOADS } from "./review-depth.mjs";

/** Profile intensity order; auto-selected profiles only move upward after the first decision. */
export const PROFILE_ORDER = ["fast", "standard", "deep", "max"];

const readYaml = (filePath) => YAML.parse(readFileSync(filePath, "utf8"));

/** Read the profile index (available profiles, default, rule version). */
export function readProfileIndex(root = process.cwd()) {
  return readYaml(path.join(root, ".agent", "profiles", "default.yaml"));
}

/** Read a named profile file after checking it against the index. */
export function readProfile(root, name) {
  const index = readProfileIndex(root);
  if (!(index.available ?? []).includes(name)) {
    throw new Error(`unknown profile: ${name}`);
  }
  const profilePath = path.join(root, ".agent", "profiles", `${name}.yaml`);
  if (!existsSync(profilePath)) {
    throw new Error(`profile file not found: ${name}.yaml`);
  }
  return readYaml(profilePath);
}

/**
 * REFINE evaluation inputs for the profile rule, taken from the agent risk
 * assessment. The verification load carries over when a later assessment omits
 * it (the verification plan did not change).
 */
export function profileInputs(assessment, { fallbackLoad = null } = {}) {
  return {
    blast_radius: assessment?.risk_assessment?.blast_radius ?? null,
    uncertainty: assessment?.risk_assessment?.uncertainty ?? null,
    verification_load: assessment?.verification_load?.level ?? fallbackLoad,
  };
}

/** List the determination inputs that are absent or unusable. */
export function missingProfileInputs(inputs) {
  const missing = [];
  if (!REVIEW_AXES.blast_radius.includes(inputs.blast_radius))
    missing.push("risk_assessment.blast_radius");
  if (!REVIEW_AXES.uncertainty.includes(inputs.uncertainty))
    missing.push("risk_assessment.uncertainty");
  if (!VERIFICATION_LOADS.includes(inputs.verification_load))
    missing.push("verification_load.level");
  return missing;
}

/**
 * Apply the REFINE-linked selection rule (design doc §5): the first matching
 * row wins, evaluated top-down.
 */
export function selectProfile({ blast_radius, uncertainty, verification_load } = {}) {
  const missing = missingProfileInputs({ blast_radius, uncertainty, verification_load });
  if (missing.length) {
    throw new Error(`profile determination inputs missing: ${missing.join(", ")}`);
  }
  if (uncertainty === "novel_or_impact_unclear") {
    return { profile: "max", matched: "max", reasons: ["uncertainty=novel_or_impact_unclear"] };
  }
  const deepReasons = [
    uncertainty === "some_unknowns" ? "uncertainty=some_unknowns" : null,
    blast_radius === "shared_or_system_wide" ? "blast_radius=shared_or_system_wide" : null,
    verification_load === "complex" ? "verification_load=complex" : null,
  ].filter(Boolean);
  if (deepReasons.length) {
    return { profile: "deep", matched: "deep", reasons: deepReasons };
  }
  if (
    uncertainty === "known_pattern" &&
    blast_radius === "local" &&
    verification_load === "routine"
  ) {
    return {
      profile: "fast",
      matched: "fast",
      reasons: ["uncertainty=known_pattern", "blast_radius=local", "verification_load=routine"],
    };
  }
  return {
    profile: "standard",
    matched: "standard",
    reasons: ["no higher-intensity rule matched"],
  };
}

/**
 * Resolve the initial task configuration: an explicit --profile (user source)
 * or a provisional default, plus the runtime adapter.
 */
export function resolveAgentProfile({
  profile: requestedProfile = null,
  runtime = null,
  root = process.cwd(),
}) {
  const index = readProfileIndex(root);
  const name = requestedProfile ?? index.default_profile;
  const profile = readProfile(root, name);

  let runtimeConfig = null;
  if (runtime) {
    const runtimePath = path.join(root, ".agent", "runtime", `${runtime}.yaml`);
    if (!existsSync(runtimePath)) throw new Error(`unknown runtime: ${runtime}`);
    runtimeConfig = readYaml(runtimePath);
  }

  return {
    profileSource: `${name}.yaml`,
    profile,
    selection: {
      selected: name,
      source: requestedProfile ? "user" : "provisional",
      ruleVersion: index.rule_version ?? 1,
    },
    runtime: runtimeConfig,
  };
}

/**
 * Evaluate the profile rule against the task's recorded agent assessment and
 * record/apply the outcome.
 *
 * - `source: "user"` (explicit --profile) always wins; the evaluation is still
 *   recorded for reference.
 * - A provisional placeholder is replaced by the first real determination.
 * - An auto-selected profile only moves upward on re-evaluation; downgrades
 *   need a user-specified profile. Tasks without a decision record (created
 *   before this mechanism) keep the loaded profile as their floor.
 *
 * With `strict`, missing inputs are reported as a REFINE gap instead of being
 * skipped. Re-evaluation only runs when the decision inputs actually changed.
 */
export function decideProfile(task, { root = process.cwd(), strict = false, trigger = null } = {}) {
  const configuration = task.configuration ?? {};
  const selection = configuration.selection ?? null;
  const inputs = profileInputs(task.agentAssessment, {
    fallbackLoad: selection?.inputs?.verification_load,
  });
  const missing = missingProfileInputs(inputs);
  if (missing.length) {
    if (strict && selection?.source !== "user") {
      throw new Error(
        `REFINEの不足条件: Profile自動判定の入力が不足しています (${missing.join(", ")})。` +
          `--assessment に risk_assessment と verification_load を含めてください`,
      );
    }
    return { decided: false, missing };
  }
  const result = selectProfile(inputs);
  if (selection?.inputs && JSON.stringify(inputs) === JSON.stringify(selection.inputs)) {
    return { decided: false, unchanged: true, selected: selection.selected };
  }
  const rank = (name) => PROFILE_ORDER.indexOf(name);
  const source = selection?.source === "user" ? "user" : "auto";
  const current = selection?.selected ?? configuration.profile?.name;
  let chosen;
  if (source === "user") {
    chosen = current;
  } else if (!selection) {
    chosen = PROFILE_ORDER[Math.max(rank(result.profile), rank(current))];
  } else if (selection.source === "provisional") {
    chosen = result.profile;
  } else {
    chosen = rank(result.profile) > rank(current) ? result.profile : current;
  }

  const evaluatedAt = new Date().toISOString();
  const revisions = [...(selection?.revisions ?? [])];
  if (chosen !== current) {
    revisions.push({
      from: current,
      to: chosen,
      reasons: result.reasons,
      inputs,
      trigger,
      at: evaluatedAt,
      head: task.head,
      state: task.state,
    });
    configuration.profile = readProfile(root, chosen);
    configuration.profileSource = `${chosen}.yaml`;
  }
  configuration.selection = {
    selected: chosen,
    source,
    ruleVersion: readProfileIndex(root).rule_version ?? 1,
    inputs,
    auto: result.profile,
    matched: result.matched,
    reasons: result.reasons,
    evaluatedAt,
    head: task.head,
    state: task.state,
    trigger,
    revisions,
  };
  task.configuration = configuration;
  return { decided: true, changed: chosen !== current, selected: chosen };
}

/** Read a required CLI option value without consuming another flag. */
function readOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

/** Parse CLI arguments for task profile resolution. --model is accepted and ignored. */
export function parseArgs(args) {
  let profile = null;
  let runtime = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      profile = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--runtime") {
      runtime = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--model") {
      readOptionValue(args, index, arg); // accepted for backward compatibility; ignored
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return { profile, runtime };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(resolveAgentProfile(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
