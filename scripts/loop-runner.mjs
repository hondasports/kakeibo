import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { resolveAgentProfile } from "./resolve-agent-profile.mjs";

/** Validate evidence required for guarded state transitions. */
function validateTransitionEvidence({ state, event, exit }) {
  if (!exit) {
    if (state === "review" && event === "clean") {
      throw new Error("review clean requires exit evidence");
    }
    return;
  }

  if (exit.state !== state || exit.event !== event) {
    throw new Error("exit evidence must match the current state and event");
  }

  if (state === "review" && event === "clean") {
    if (exit.openFindings !== 0) {
      throw new Error("review clean requires openFindings=0");
    }
    if (!Array.isArray(exit.evidence) || exit.evidence.length === 0) {
      throw new Error("review clean requires non-empty evidence");
    }
  }
}

/** Resolve the current workflow state or an allowed next-state transition. */
export function resolveLoopStep({
  state,
  event = null,
  model,
  profile = null,
  runtime = null,
  exit = null,
  root = process.cwd(),
}) {
  const processConfig = YAML.parse(readFileSync(path.join(root, ".agent", "process.yaml"), "utf8"));
  const currentState = state ?? processConfig.initial;
  const stateConfig = processConfig.states?.[currentState];
  if (!stateConfig) {
    throw new Error(`unknown state: ${currentState}`);
  }

  const resolved = resolveAgentProfile({ model, profile, runtime, root });
  if (!event) {
    return { state: currentState, stateConfig, ...resolved };
  }

  const nextState = stateConfig.on?.[event];
  if (!nextState) {
    throw new Error(`event ${event} is not allowed from ${currentState}`);
  }

  validateTransitionEvidence({ state: currentState, event, exit });
  return { state: currentState, event, nextState, ...resolved };
}

/** Read a required CLI option value without consuming another flag. */
function readOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

/** Parse CLI arguments for workflow state resolution. */
export function parseArguments(args) {
  const out = { state: null, event: null, model: "", profile: null, runtime: null, exit: null };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--state") {
      out.state = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--event") {
      out.event = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--model") {
      out.model = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--profile") {
      out.profile = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--runtime") {
      out.runtime = readOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--exit") {
      out.exit = JSON.parse(readOptionValue(args, index, arg));
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!out.model) {
    throw new Error("--model is required");
  }
  return out;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(resolveLoopStep(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
