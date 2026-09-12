import { isMap, parseDocument } from "yaml";
import { PRODUCT_UPDATE_CATEGORIES, type ProductUpdateCategory } from "./productUpdates";

export const UPDATE_SPEC_START_MARKER = "<!-- suzumemo-update:start -->";
export const UPDATE_SPEC_END_MARKER = "<!-- suzumemo-update:end -->";

export type PublishProductUpdateSpec = {
  publish: true;
  category: ProductUpdateCategory;
  description: string;
};

export type SkipProductUpdateSpec = {
  publish: false;
  reason: string;
};

export type ProductUpdateSpec = PublishProductUpdateSpec | SkipProductUpdateSpec;

export type ProductUpdateSpecResult =
  | { ok: true; spec: ProductUpdateSpec }
  | { ok: false; errors: string[] };

const CODE_FENCE_PATTERN = /```([^\n`]*)\r?\n([\s\S]*?)```/g;

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^(?:todo|tbd|fixme|placeholder|example|sample)[\s:：].*/i,
  /^(?:todo|tbd|fixme|placeholder)$/i,
  /^<[^>]+>$/,
];

function countOccurrences(text: string, needle: string): number[] {
  const positions: number[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    positions.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return positions;
}

/** Extract the single fenced yaml block inside the suzumemo-update markers. */
export function extractUpdateSpecYaml(
  body: string | null | undefined,
): { ok: true; yaml: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const text = body ?? "";

  const starts = countOccurrences(text, UPDATE_SPEC_START_MARKER);
  const ends = countOccurrences(text, UPDATE_SPEC_END_MARKER);

  if (starts.length === 0 && ends.length === 0) {
    return {
      ok: false,
      errors: [
        `更新履歴ブロックがありません。${UPDATE_SPEC_START_MARKER} と ${UPDATE_SPEC_END_MARKER} で囲んだ yaml ブロックを記入してください。`,
      ],
    };
  }
  if (starts.length !== 1 || ends.length !== 1) {
    errors.push(
      `suzumemo-update マーカーは開始・終了それぞれ1つだけにしてください(start: ${starts.length}, end: ${ends.length})。`,
    );
    return { ok: false, errors };
  }

  const start = starts[0] + UPDATE_SPEC_START_MARKER.length;
  const end = ends[0];
  if (start > end) {
    return {
      ok: false,
      errors: ["suzumemo-update マーカーの順序が不正です(start が end の後にあります)。"],
    };
  }

  const outer = `${text.slice(0, starts[0])}${text.slice(end + UPDATE_SPEC_END_MARKER.length)}`;
  if (outer.replace(/<!--[\s\S]*?-->/g, "").includes("<!--")) {
    return {
      ok: false,
      errors: ["PR本文に閉じられていないHTMLコメント(<!--)があります。"],
    };
  }

  const inner = text.slice(start, end);
  const fences = [...inner.matchAll(CODE_FENCE_PATTERN)];
  if (fences.length === 0) {
    errors.push("マーカー内に yaml コードブロックがありません。");
    return { ok: false, errors };
  }
  if (fences.length > 1) {
    errors.push(`マーカー内のコードブロックは1つだけにしてください(検出: ${fences.length})。`);
    return { ok: false, errors };
  }

  const fence = fences[0];
  const info = (fence[1] ?? "").trim();
  if (info !== "yaml") {
    errors.push(`マーカー内のコードブロックは \`\`\`yaml としてください(検出: \`\`\`${info})。`);
  }

  const outside = `${inner.slice(0, fence.index)}${inner.slice(fence.index + fence[0].length)}`;
  const outsideWithoutComments = outside.replace(/<!--[\s\S]*?-->/g, "");
  if (outsideWithoutComments.trim() !== "") {
    errors.push("マーカー内には yaml コードブロック以外を記述しないでください。");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, yaml: fence[2] ?? "" };
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function validateRequiredText(value: unknown, field: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} は空でない文字列が必須です。`);
    return false;
  }
  if (isPlaceholderValue(value)) {
    errors.push(`${field} にプレースホルダーは使えません。実際の内容を記入してください。`);
    return false;
  }
  return true;
}

/** Validate the parsed yaml object against the fixed suzumemo-update schema. */
export function validateSpecValue(value: unknown): ProductUpdateSpecResult {
  const errors: string[] = [];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["yaml の内容はキーと値のマッピングにしてください。"] };
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["publish", "category", "description", "reason"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      errors.push(`未知のキー \`${key}\` は使えません。`);
    }
  }

  if (typeof record.publish !== "boolean") {
    errors.push("`publish` は必須で、true または false を記入してください。");
    return { ok: false, errors };
  }

  if (record.publish === true) {
    if (!PRODUCT_UPDATE_CATEGORIES.includes(record.category as ProductUpdateCategory)) {
      errors.push(
        `掲載する場合 \`category\` は ${PRODUCT_UPDATE_CATEGORIES.join(" / ")} のいずれかが必須です。`,
      );
    }
    validateRequiredText(record.description, "`description`", errors);
    if (record.reason !== undefined) {
      errors.push("掲載する場合に `reason` は記入できません。");
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }
    return {
      ok: true,
      spec: {
        publish: true,
        category: record.category as ProductUpdateCategory,
        description: (record.description as string).trim(),
      },
    };
  }

  validateRequiredText(record.reason, "`reason`", errors);
  if (record.category !== undefined) {
    errors.push("非掲載の場合に `category` は記入できません。");
  }
  if (record.description !== undefined) {
    errors.push("非掲載の場合に `description` は記入できません。");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, spec: { publish: false, reason: (record.reason as string).trim() } };
}

/** Parse the yaml block text into a validated spec. */
export function parseProductUpdateSpec(yamlText: string): ProductUpdateSpecResult {
  const document = parseDocument(yamlText, { uniqueKeys: true, strict: true });
  const errors = document.errors.map((error) => `YAML構文エラー: ${error.message.split("\n")[0]}`);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (!isMap(document.contents)) {
    return { ok: false, errors: ["yaml の内容はキーと値のマッピングにしてください。"] };
  }
  return validateSpecValue(document.toJS());
}

/** Extract and validate the suzumemo-update spec from a pull request body. */
export function readProductUpdateSpec(body: string | null | undefined): ProductUpdateSpecResult {
  const extracted = extractUpdateSpecYaml(body);
  if (!extracted.ok) {
    return extracted;
  }
  return parseProductUpdateSpec(extracted.yaml);
}
