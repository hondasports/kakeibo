import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

export const STATES_DOC_PATH = "docs/agent-harness-states.md";
const PROCESS_PATH = ".agent/process.yaml";

/** `.agent/process.yaml` から State仕様のMarkdown本文を生成する。 */
export function generateHarnessStatesDoc(processYamlText) {
  const config = YAML.parse(processYamlText);
  const states = config?.states ?? {};
  const limits = config?.limits ?? {};
  const lines = [];
  lines.push("# Agent Harness State仕様");
  lines.push("");
  lines.push(
    `> このファイルは \`${PROCESS_PATH}\` から \`node scripts/generate-harness-docs.mjs\` で自動生成する。直接編集しない。State名・イベント名・上限値の正本は process.yaml のみ。`,
  );
  lines.push("");
  lines.push(`initial state: \`${config.initial}\``);
  lines.push("");
  lines.push("## States");
  lines.push("");
  lines.push("| State | workflow | terminal |");
  lines.push("|---|---|---|");
  for (const [name, def] of Object.entries(states)) {
    const workflow = def?.workflow ? `\`${def.workflow}\`` : "-";
    lines.push(`| ${name} | ${workflow} | ${def?.terminal ? "yes" : "-"} |`);
  }
  lines.push("");
  lines.push("## 遷移");
  lines.push("");
  lines.push("| State | event | 遷移先 |");
  lines.push("|---|---|---|");
  for (const [name, def] of Object.entries(states)) {
    for (const [event, target] of Object.entries(def?.on ?? {})) {
      lines.push(`| ${name} | ${event} | ${target} |`);
    }
  }
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  lines.push("| key | value |");
  lines.push("|---|---|");
  for (const [key, value] of Object.entries(limits)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");
  lines.push("## Flow");
  lines.push("");
  lines.push("```mermaid");
  lines.push("flowchart TD");
  for (const [name, def] of Object.entries(states)) {
    for (const [event, target] of Object.entries(def?.on ?? {})) {
      lines.push(`  ${name} -- ${event} --> ${target}`);
    }
  }
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

/** 生成結果とコミット済みファイルが一致しない理由を返す。一致なら null。 */
export function checkHarnessStatesDoc(repoRoot) {
  const processPath = path.join(repoRoot, PROCESS_PATH);
  if (!existsSync(processPath)) return null;
  const expected = generateHarnessStatesDoc(readFileSync(processPath, "utf8"));
  const docPath = path.join(repoRoot, STATES_DOC_PATH);
  if (!existsSync(docPath)) {
    return `${STATES_DOC_PATH} が存在しません。node scripts/generate-harness-docs.mjs で生成してください`;
  }
  const actual = readFileSync(docPath, "utf8");
  if (actual !== expected) {
    return `${STATES_DOC_PATH} が ${PROCESS_PATH} と一致しません。node scripts/generate-harness-docs.mjs で再生成してください`;
  }
  return null;
}

export function runGenerateHarnessDocs({ cwd = process.cwd() } = {}) {
  const processPath = path.join(cwd, PROCESS_PATH);
  const expected = generateHarnessStatesDoc(readFileSync(processPath, "utf8"));
  const docPath = path.join(cwd, STATES_DOC_PATH);
  writeFileSync(docPath, expected);
  console.log(`generated: ${STATES_DOC_PATH}`);
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runGenerateHarnessDocs({ cwd: process.cwd() });
}
