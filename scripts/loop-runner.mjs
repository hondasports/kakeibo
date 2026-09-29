import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { resolveAgentProfile } from "./resolve-agent-profile.mjs";

export function resolveLoopStep({
  state,
  event = null,
  model,
  runtime = null,
  root = process.cwd(),
}) {
  const processConfig = YAML.parse(readFileSync(path.join(root, ".agent", "process.yaml"), "utf8"));
  const currentState = state ?? processConfig.initial;
  const stateConfig = processConfig.states?.[currentState];
  if (!stateConfig) {
    throw new Error(`unknown state: ${currentState}`);
  }

  const resolved = resolveAgentProfile({ model, runtime, root });
  if (!event) {
    return { state: currentState, stateConfig, ...resolved };
  }

  const nextState = stateConfig.on?.[event];
  if (!nextState) {
    throw new Error(`event ${event} is not allowed from ${currentState}`);
  }
  return { state: currentState, event, nextState, ...resolved };
}

function parseArgs(args) {
  const out = { state: null, event: null, model: "", runtime: null };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--state") {
      out.state = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--event") {
      out.event = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--model") {
      out.model = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--runtime") {
      out.runtime = args[index + 1] ?? null;
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
    console.log(JSON.stringify(resolveLoopStep(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
