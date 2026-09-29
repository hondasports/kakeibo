import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeChangedPath } from "./classify-e2e-relevance.mjs";

const RULES = [
  { trigger: "authentication_or_authorization", match: (p) => /(?:^|[/._-])(?:auth|permission|guard)(?![a-z])|system-admin|group-admin/i.test(p) },
  { trigger: "schema_or_migration", match: (p) => p === "convex/schema.ts" || /(?:^|\/)migrations?(?:\/|$)/i.test(p) },
  { trigger: "data_deletion_or_retention", match: (p) => /delet|retention/i.test(p) },
  { trigger: "complex_state_transition_or_orchestration_port", match: (p) => p.startsWith(".agent/") || p.startsWith(".github/workflows/") || /^scripts\/(?:loop-|assess-|machine-risk|resolve-agent-profile)/.test(p) },
  { trigger: "external_service_write_or_webhook", match: (p) => /webhook|line-integration|resend/i.test(p) },
];

export function machineRiskForPaths(paths = []) {
  const changedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const triggers = [];
  for (const rule of RULES) if (changedPaths.some(rule.match)) triggers.push(rule.trigger);
  return { changedPaths, floorTriggers: [...new Set(triggers)], minimumTier: triggers.length > 0 ? "T3" : "T1" };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).flatMap((value) => value.split(",")).filter(Boolean);
  console.log(JSON.stringify(machineRiskForPaths(paths), null, 2));
}
