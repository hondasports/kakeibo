import { requiredKeys } from "./loop-schema.mjs";
import { machineRiskForPaths } from "./machine-risk.mjs";

/**
 * `--draft <kind>` の下書き生成。機械的に決まる値だけ埋め、判断が要る値は
 * 必ず "TODO" にする。下書きのまま提出できないよう、受理側は todoPointers で
 * 残存 TODO を拒否する（どちらも requiredKeys と同じ定義を共有）。
 */
export const DRAFT_TODO = "TODO";

/** JSON Pointer (RFC 6901) list of every literal "TODO" left in a document. */
export function todoPointers(value, pointer = "") {
  const pointers = [];
  if (value === DRAFT_TODO) return [pointer || "/"];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      pointers.push(...todoPointers(item, `${pointer}/${index}`));
    });
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1");
      pointers.push(...todoPointers(item, `${pointer}/${escaped}`));
    }
  }
  return pointers;
}

/**
 * Machine-Floor triggersから下書き初期値を導く軸マップ（Issue #948の表）。
 * triggerがない軸はFloorを持たないので null（= "TODO" のまま）。
 */
export function assessmentDraftFloors(floorTriggers = []) {
  const triggers = new Set(floorTriggers);
  const has = (...names) => names.some((name) => triggers.has(name));
  return {
    data_security: has(
      "authentication_or_authorization",
      "schema_or_migration",
      "data_deletion_or_retention",
    )
      ? "direct_boundary_change"
      : null,
    reversibility: has(
      "schema_or_migration",
      "data_deletion_or_retention",
      "external_service_write_or_webhook",
    )
      ? "difficult_or_stateful"
      : null,
  };
}

/** 「やりたいこと」節だけをIssue本文から取り出す。見つからなければ null。 */
export function issueGoalSection(body = "") {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s*やりたいこと/.test(line));
  if (start < 0) return null;
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    section.push(line);
  }
  const text = section.join("\n").trim();
  return text.length > 0 ? text : null;
}

const ISSUE_PATH_PATTERN = /(?:^|[\s'"`(（])([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/g;
// GitHub blob/tree/edit URLs embed the path after the ref segment; capture
// only that tail so `github.com/o/r/blob/main/scripts/x.ts` counts as
// `scripts/x.ts` (the bare pattern misses it entirely).
const ISSUE_URL_PATH_PATTERN =
  /github\.com\/[^\s'"`(（/]+\/[^\s'"`(（/]+\/(?:blob|tree|edit|raw)\/[^\s'"`(（/]+\/([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/g;

/** Issue本文で言及されたパスにMachine Floorを適用した tier を返す。 */
export function issuePredictedRisk(body = "") {
  const paths = [
    ...[...body.matchAll(ISSUE_PATH_PATTERN), ...body.matchAll(ISSUE_URL_PATH_PATTERN)].map(
      (match) => match[1],
    ),
  ].filter((candidate) => /\.(ts|tsx|mts|js|jsx|mjs|cjs|json|ya?ml|md|css|sh)$/.test(candidate));
  return machineRiskForPaths(paths).minimumTier;
}

/** --draft spec：機械情報だけ埋めた spec 下書き。 */
function specDraft(issueBody) {
  return {
    goal: DRAFT_TODO,
    humanRequest:
      issueBody === undefined ? DRAFT_TODO : (issueGoalSection(issueBody) ?? DRAFT_TODO),
    acceptanceCriteria: [{ id: DRAFT_TODO, text: DRAFT_TODO }],
    nonGoals: [DRAFT_TODO],
    assumptions: [DRAFT_TODO],
    openMaterialDecisions: [],
    verificationStrategy: [DRAFT_TODO],
    predictedRisk: issueBody === undefined ? "T1" : issuePredictedRisk(issueBody),
  };
}

/** --draft assessment：現在差分のMachine評価から初期値を埋める。 */
function assessmentDraft({ floorTriggers = [], minimumTier = "T1" }) {
  const floors = assessmentDraftFloors(floorTriggers);
  return {
    risk_assessment: {
      blast_radius: DRAFT_TODO,
      data_security: floors.data_security ?? DRAFT_TODO,
      reversibility: floors.reversibility ?? DRAFT_TODO,
      uncertainty: DRAFT_TODO,
      floor_triggers: [...floorTriggers],
    },
    tier_rationale: floorTriggers.length > 0 ? floorTriggers.join(", ") : DRAFT_TODO,
    applied_tier: minimumTier,
  };
}

/**
 * review-template.json と同一の形の下書き。--review-packet の template
 * 生成もこの関数を使うので、acceptされる形がずれない。
 */
export function reviewDraft({ head, baseHead, deltaFrom, task }) {
  return {
    head,
    baseHead,
    ...(deltaFrom ? { deltaFrom } : {}),
    reviewer: DRAFT_TODO,
    independent: task?.assessment?.review?.independent === true,
    context: "fresh",
    _notes: [
      "finding.status is open|fixed|dismissed|deferred (unique id, non-empty evidence); every prior finding id must appear",
      "finding.severity is REQUIRED on every new finding — an omitted severity counts as major: blocker = fails an AC / security or data destruction / production outage; major = wrong behavior, missing coverage with regression risk, contract violation; minor = readability/maintainability, small inconsistencies; nit = formatting/naming preferences",
      "status deferred is allowed only for severity minor|nit and needs followUp: https://github.com/<owner>/<repo>/issues/<n>; open blocker/major findings block clean, minor/nit may be deferred with a follow-up issue instead of fixed now",
      "prior findings are prefilled with their last status; re-check each and write evidence (a closed finding untouched by the increment may cite the previous review)",
      "deltaFrom (optional): SHA of a previously reviewed head — scopes review to the increment",
      "assessment must satisfy the machine floor, not merely the reviewer's own rating",
    ],
    evidence: [DRAFT_TODO],
    findings: (task?.findings ?? []).map((finding) => ({
      id: finding.id,
      status: finding.status,
      ...(finding.severity ? { severity: finding.severity } : {}),
      evidence: DRAFT_TODO,
    })),
    acceptanceCriteria: (task?.spec?.acceptanceCriteria ?? []).map((ac) => ({
      id: ac.id,
      evidence: DRAFT_TODO,
    })),
    assessment: {
      // Optional fields (applied_tier, verification_load) stay absent —
      // a present-but-empty value fails validation, an absent one is unset.
      risk_assessment: {
        blast_radius: DRAFT_TODO,
        data_security: DRAFT_TODO,
        reversibility: DRAFT_TODO,
        uncertainty: DRAFT_TODO,
        floor_triggers: [],
      },
      tier_rationale: DRAFT_TODO,
    },
  };
}

/** --draft exit：requiredKeys("exit", context) が返すキーを埋めた下書き。 */
const EXIT_VALUE_TEMPLATES = {
  reproduction: { command: DRAFT_TODO, result: DRAFT_TODO, note: DRAFT_TODO },
  approval: { source: "user", reference: DRAFT_TODO },
  ciFailure: [{ check: DRAFT_TODO }],
};
function exitDraft({ event, task, limits, root }) {
  const context = {
    event,
    state: task?.state,
    counters: task?.counters,
    limits,
  };
  const draft = {};
  for (const key of requiredKeys("exit", context, root)) {
    if (key === "state") draft.state = task?.state ?? DRAFT_TODO;
    else if (key === "event") draft.event = event;
    else draft[key] = structuredClone(EXIT_VALUE_TEMPLATES[key] ?? DRAFT_TODO);
  }
  return draft;
}

export function buildDraft({
  kind,
  task = null,
  event,
  issueBody,
  machine = { floorTriggers: [], minimumTier: "T1" },
  head,
  baseHead,
  limits,
  root,
}) {
  if (kind === "spec") return specDraft(issueBody);
  if (kind === "assessment") return assessmentDraft(machine);
  if (kind === "review") return reviewDraft({ head, baseHead, task });
  if (kind === "exit") return exitDraft({ event, task, limits, root });
  throw new Error(`unknown draft kind: ${kind} (spec|assessment|review|exit)`);
}
