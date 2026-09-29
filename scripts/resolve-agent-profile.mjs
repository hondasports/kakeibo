import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const merge = (base, override) => {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    return override;
  }

  const out = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(base[key] ?? {}, value)
        : value;
  }
  return out;
};

const wildcard = (pattern, value) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
};

export function resolveAgentProfile({ model, runtime = null, root = process.cwd() }) {
  const profileDir = path.join(root, ".agent", "profiles");
  const runtimeDir = path.join(root, ".agent", "runtime");
  const defaultProfile = YAML.parse(
    readFileSync(path.join(profileDir, "default.yaml"), "utf8"),
  );
  let selected = null;
  let selectedFile = null;

  for (const file of readdirSync(profileDir).filter(
    (name) => name.endsWith(".yaml") && name !== "default.yaml",
  )) {
    const candidate = YAML.parse(readFileSync(path.join(profileDir, file), "utf8"));
    if ((candidate.match ?? []).some((pattern) => wildcard(pattern, model))) {
      selected = candidate;
      selectedFile = file;
      break;
    }
  }

  const profile = merge(defaultProfile, selected ?? {});
  let runtimeConfig = null;
  if (runtime) {
    const runtimePath = path.join(runtimeDir, `${runtime}.yaml`);
    if (existsSync(runtimePath)) {
      runtimeConfig = YAML.parse(readFileSync(runtimePath, "utf8"));
    }
  }

  return {
    model,
    profileSource: selectedFile ?? "default.yaml",
    profile,
    runtime: runtimeConfig,
  };
}

function parseArgs(args) {
  let model = "";
  let runtime = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      model = args[index + 1] ?? "";
      index += 1;
    } else if (arg === "--runtime") {
      runtime = args[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!model) {
    throw new Error("--model is required");
  }
  return { model, runtime };
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
