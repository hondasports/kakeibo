import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeChangedPath } from "./classify-e2e-relevance.mjs";

const RULES = [
  {
    trigger: "authentication_or_authorization",
    match: (filePath) =>
      /(?:^|[/._-])(?:auth|permission|guard)(?![a-z])|system-admin|group-admin/i.test(filePath),
  },
  {
    trigger: "schema_or_migration",
    match: (filePath) =>
      filePath === "convex/schema.ts" || /(?:^|\/)migrations?(?:\/|$)/i.test(filePath),
  },
  {
    trigger: "data_deletion_or_retention",
    match: (filePath) => /delet|retention/i.test(filePath),
  },
  {
    trigger: "complex_state_transition_or_orchestration_port",
    match: (filePath) =>
      filePath.startsWith(".agent/") ||
      filePath.startsWith(".github/workflows/") ||
      /^scripts\/(?:loop-|assess-|machine-risk|resolve-agent-profile)/.test(filePath),
  },
  {
    trigger: "external_service_write_or_webhook",
    match: (filePath) => /webhook|line-integration|resend/i.test(filePath),
  },
];

/** Compute the machine-enforced minimum review tier for changed paths. */
export function machineRiskForPaths(paths = []) {
  const changedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const triggers = [];
  for (const rule of RULES) {
    if (changedPaths.some(rule.match)) {
      triggers.push(rule.trigger);
    }
  }
  return {
    changedPaths,
    floorTriggers: [...new Set(triggers)],
    minimumTier: triggers.length > 0 ? "T3" : "T1",
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const paths = process.argv
    .slice(2)
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  console.log(JSON.stringify(machineRiskForPaths(paths), null, 2));
}
