import { readFileSync } from "node:fs";
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
]);
export function validateSchema(schema, value, location = "$") {
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
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
export function validateDocument(name, value, root = process.cwd()) {
  const schema = JSON.parse(
    readFileSync(path.join(root, ".agent/schema", `${name}.schema.json`), "utf8"),
  );
  validateSchema(schema, value);
}
