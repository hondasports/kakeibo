import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveAgentProfile } from "./resolve-agent-profile.mjs";

export function resolveLoopStep({ state, event = null, model, runtime = null, root = process.cwd() }) {
  const processConfig = YAML.parse(readFileSync(path.join(root, ".agent", "process.yaml"), "utf8"));
  const currentState = state ?? processConfig.initial;
  const stateConfig = processConfig.states?.[currentState];
  if (!stateConfig) throw new Error(`unknown state: ${currentState}`);
  const resolved = resolveAgentProfile({ model, runtime, root });
  if (!event) return { state: currentState, stateConfig, ...resolved };
  const nextState = stateConfig.on?.[event];
  if (!nextState) throw new Error(`event ${event} is not allowed from ${currentState}`);
  return { state: currentState, event, nextState, ...resolved };
}

function parseArgs(args) {
  const out = { state: null, event: null, model: "", runtime: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--state") out.state = args[++i] ?? null;
    else if (args[i] === "--event") out.event = args[++i] ?? null;
    else if (args[i] === "--model") out.model = args[++i] ?? "";
    else if (args[i] === "--runtime") out.runtime = args[++i] ?? null;
    else throw new Error(`unknown option: ${args[i]}`);
  }
  if (!out.model) throw new Error("--model is required");
  return out;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(resolveLoopStep(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
