import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readProductUpdateSpec,
  UPDATE_SPEC_START_MARKER,
  type ProductUpdateSpecResult,
} from "../src/lib/productUpdateSpec.ts";

type PullRequestEventPayload = {
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    base?: { ref?: string };
    user?: { type?: string; login?: string };
  };
};

export type SpecCheckDecision =
  | { kind: "validated"; result: ProductUpdateSpecResult; summary: string }
  | { kind: "skipped"; summary: string };

const REQUIRED_BASE = "preview";

/** Decide whether the pull request body must contain a valid suzumemo-update spec. */
export function evaluatePullRequestSpec(payload: PullRequestEventPayload): SpecCheckDecision {
  const pull = payload.pull_request;
  const label = `PR #${pull?.number ?? "?"} (${pull?.title ?? "untitled"})`;

  if (!pull) {
    return { kind: "skipped", summary: "pull_request payload がありません" };
  }

  const baseRef = pull.base?.ref;
  if (baseRef !== REQUIRED_BASE) {
    return {
      kind: "skipped",
      summary: `${label}: base が ${baseRef ?? "?"} のため対象外です(preview向けPRのみ検証します)。`,
    };
  }

  const authorType = pull.user?.type;
  const hasUpdateSpecMarker = (pull.body ?? "").includes(UPDATE_SPEC_START_MARKER);
  if (authorType === "Bot" && !hasUpdateSpecMarker) {
    return {
      kind: "skipped",
      summary: `${label}: bot作成PRで更新履歴ブロックがないため対象外です(dependabot等)。`,
    };
  }

  const result = readProductUpdateSpec(pull.body);
  if (!result.ok) {
    return {
      kind: "validated",
      result,
      summary: `${label}: 更新履歴欄に問題があります。\n${result.errors.map((e) => `- ${e}`).join("\n")}`,
    };
  }

  const spec = result.spec;
  const detail =
    spec.publish === true
      ? `掲載(category: ${spec.category})`
      : `非掲載(reason: ${spec.reason.split("\n")[0]})`;
  return {
    kind: "validated",
    result,
    summary: `${label}: ${detail}`,
  };
}

function writeStepSummary(text: string): void {
  const summary = `## PR update spec\n\n${text}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

function main(): void {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH が設定されていません");
  }

  const payload = JSON.parse(readFileSync(eventPath, "utf8")) as PullRequestEventPayload;
  const decision = evaluatePullRequestSpec(payload);

  writeStepSummary(decision.summary);

  if (decision.kind === "validated" && !decision.result.ok) {
    for (const error of decision.result.errors) {
      console.error(`::error::${error}`);
    }
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
