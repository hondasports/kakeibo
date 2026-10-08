import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// The repository schemas intentionally use this small, explicit JSON Schema subset.
const keywords = new Set([
  "$schema",
  "title",
  "description",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "minLength",
  "minimum",
  "enum",
  "const",
  "anyOf",
]);
export function validateSchema(schema, value, location = "$") {
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  }
  if (schema.anyOf) {
    const errors = [];
    for (const sub of schema.anyOf) {
      try {
        validateSchema(sub, value, location);
        return;
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error(`${location}: no anyOf match (${errors.join("; ")})`);
  }
  const fail = (message) => {
    throw new Error(`${location}: ${message}`);
  };
  const matches = (type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object")
      return value !== null && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isSafeInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  };
  if (schema.type && ![schema.type].flat().some(matches)) fail(`expected ${schema.type}`);
  if ("const" in schema && value !== schema.const) fail("invalid constant");
  if (schema.enum && !schema.enum.includes(value)) fail("invalid enum value");
  if (typeof value === "string" && value.trim().length < (schema.minLength ?? 0))
    fail("empty string");
  if (typeof value === "number" && value < (schema.minimum ?? -Infinity)) fail("below minimum");
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) fail("too few items");
    if (schema.items)
      value.forEach((item, index) => validateSchema(schema.items, item, `${location}[${index}]`));
  }
  if (matches("object")) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key])
        validateSchema(schema.properties[key], item, `${location}.${key}`);
      else if (schema.additionalProperties === false) fail(`unknown field ${key}`);
    }
  }
}
/**
 * Schema documents are re-parsed on every validateTask save/load; memoize per
 * file + mtime so repeated validation in one process skips the read and parse
 * while an on-disk edit still busts the entry.
 */
const schemaCache = new Map();
function schemaDocument(name, root = process.cwd()) {
  const file = path.join(root, ".agent/schema", `${name}.schema.json`);
  const stamp = statSync(file).mtimeMs;
  const hit = schemaCache.get(file);
  if (!hit || hit.stamp !== stamp)
    schemaCache.set(file, { stamp, schema: JSON.parse(readFileSync(file, "utf8")) });
  return schemaCache.get(file).schema;
}
export function validateDocument(name, value, root = process.cwd()) {
  validateSchema(schemaDocument(name, root), value);
}
/**
 * Required keys for a submitted JSON document ("kind"), drawn from the schema's
 * `required` list plus the keys a validator demands conditionally. Validators
 * that require keys beyond a schema's `required` MUST derive them from this
 * function so `--draft` output and submission validation can never diverge;
 * later issues add keys by extending the schema/validator entries here (e.g.
 * #950 prAllowed, #951 finding severity, #958 reproduction — see
 * docs/agent-harness.md).
 *
 * Top-level keys only; nested required keys live in the shared draft templates.
 */
const SCHEMA_BACKED_KINDS = new Set(["spec", "exit"]);
const VALIDATOR_REQUIRED = {
  // The agent assessment is defined by validateAssessment (review-depth.mjs);
  // assessment.schema.json describes the machine assessment instead.
  assessment: ["risk_assessment", "tier_rationale"],
  review: [
    "head",
    "baseHead",
    "reviewer",
    "evidence",
    "findings",
    "acceptanceCriteria",
    "assessment",
  ],
};
const CONDITIONAL_REQUIRED = {
  // Mirrors the event-specific exit requirements in validateTransition.
  exit: (context = {}) => {
    const { event, state, counters, limits } = context;
    const keys = [];
    if (["decision_required", "repeated_failure"].includes(event)) keys.push("reason");
    if (event === "resolved" && state === "human_gate") keys.push("approval");
    if (event === "resolved" && state === "incident") keys.push("resolution");
    if (event === "findings") {
      keys.push("reason");
      if (limits && counters && (counters.review + 1) % limits.review_reassess_every === 0)
        keys.push("reassessment");
    }
    if (event === "ci_failure") keys.push("reason", "reproduction", "ciFailure");
    return keys;
  },
};
export function requiredKeys(kind, context = {}, root = process.cwd()) {
  const schemaRequired = SCHEMA_BACKED_KINDS.has(kind)
    ? (schemaDocument(kind, root).required ?? [])
    : [];
  return [
    ...new Set([
      ...schemaRequired,
      ...(VALIDATOR_REQUIRED[kind] ?? []),
      ...(CONDITIONAL_REQUIRED[kind]?.(context) ?? []),
    ]),
  ];
}
