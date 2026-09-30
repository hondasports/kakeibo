import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

/** Match a model name against a simple asterisk wildcard pattern. */
const wildcard = (pattern, value) => {
  const escaped = pattern.replace(/[.+?^$()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
};

/** Read a YAML file from the Agent Harness. */
const readYaml = (filePath) => YAML.parse(readFileSync(filePath, "utf8"));

/** Resolve a model definition, falling back to the vendor-neutral default. */
function resolveModelDefinition({ model, modelDir }) {
  const fallback = readYaml(path.join(modelDir, "default.yaml"));

  for (const file of readdirSync(modelDir).filter(
    (name) => name.endsWith(".yaml") && name !== "default.yaml",
  )) {
    const candidate = readYaml(path.join(modelDir, file));
    if ((candidate.match ?? []).some((pattern) => wildcard(pattern, model))) {
      return { modelSource: file, modelConfig: candidate };
    }
  }

  return { modelSource: "default.yaml", modelConfig: fallback };
}

/** Resolve abstract task effort into the provider/model-specific effort level. */
function resolveEffort({ model, modelSource, modelConfig, requested }) {
  const supported = modelConfig.effort?.supported ?? [];
  const mapping = modelConfig.effort?.mapping ?? {};
  const resolved = mapping[requested] ?? (supported.includes(requested) ? requested : null);

  if (modelSource !== "default.yaml" && requested && !resolved) {
    throw new Error(`model ${model} cannot resolve effort ${requested}`);
  }

  return {
    requested: requested ?? null,
    resolved,
    parameter: modelConfig.effort?.parameter ?? null,
    supported,
  };
}

/** Resolve task profile, model registry entry, effort mapping, and runtime adapter. */
export function resolveAgentProfile({
  model,
  profile: requestedProfile = null,
  runtime = null,
  root = process.cwd(),
}) {
  const profileDir = path.join(root, ".agent", "profiles");
  const modelDir = path.join(root, ".agent", "models");
  const runtimeDir = path.join(root, ".agent", "runtime");
  const profileIndex = readYaml(path.join(profileDir, "default.yaml"));
  const { modelSource, modelConfig } = resolveModelDefinition({ model, modelDir });

  const profileName =
    requestedProfile ?? modelConfig.recommended_profile ?? profileIndex.default_profile;
  if (!(profileIndex.available ?? []).includes(profileName)) {
    throw new Error(`unknown profile: ${profileName}`);
  }

  const profilePath = path.join(profileDir, `${profileName}.yaml`);
  if (!existsSync(profilePath)) {
    throw new Error(`profile file not found: ${profileName}.yaml`);
  }
  const profile = readYaml(profilePath);
  const effort = resolveEffort({
    model,
    modelSource,
    modelConfig,
    requested: profile.effort,
  });

  let runtimeConfig = null;
  if (runtime) {
    const runtimePath = path.join(runtimeDir, `${runtime}.yaml`);
    if (!existsSync(runtimePath)) throw new Error(`unknown runtime: ${runtime}`);
    if (existsSync(runtimePath)) {
      runtimeConfig = readYaml(runtimePath);
    }
  }

  return {
    model,
    modelSource,
    modelConfig,
    profileSource: `${profileName}.yaml`,
    profile,
    effort,
    runtime: runtimeConfig,
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

/** Parse CLI arguments for task profile and model resolution. */
export function parseArgs(args) {
  let model = "";
  let profile = null;
  let runtime = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      model = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--profile") {
      profile = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--runtime") {
      runtime = readOptionValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!model) {
    throw new Error("--model is required");
  }
  return { model, profile, runtime };
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
