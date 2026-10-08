import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { readBranchChangedPaths, readWorktreeChangedPaths } from "../suggest-skills.mjs";
import { isMetadataOnlyPath, normalizeChangedPath } from "../classify-e2e-relevance.mjs";
import {
  CHECK_COMMANDS,
  computeAssessment,
  highestTier,
  missingRequirements,
  requireValue,
  validateTask,
  validateTransition,
} from "../loop-policy.mjs";
import { DRAFT_TODO, todoPointers } from "../loop-draft.mjs";
import { requireSafeTaskId } from "./evidence.mjs";
import { recordMetric } from "./metrics.mjs";

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
/** Submitted JSON may not carry an unfilled draft placeholder (#948). */
export const readSubmission = (file, kind) => {
  const document = readJson(file);
  const todos = todoPointers(document);
  requireValue(
    todos.length === 0,
    `Unfilled ${kind} draft placeholders (${DRAFT_TODO}): ${todos.join(", ")}`,
  );
  return document;
};
export const readYaml = (filePath) => YAML.parse(readFileSync(filePath, "utf8"));
/** Runtime adapter config (`.agent/runtime/<name>.yaml`); profiles are gone. */
export function resolveRuntime({ runtime = null, root = process.cwd() } = {}) {
  if (!runtime) return null;
  const runtimePath = path.join(root, ".agent", "runtime", `${runtime}.yaml`);
  if (!existsSync(runtimePath)) throw new Error(`unknown runtime: ${runtime}`);
  return readYaml(runtimePath);
}
// Full promotion patches can exceed Node's default 1 MiB subprocess buffer.
export const GIT_MAX_BUFFER = 32 * 1024 * 1024;
export const git = (args, root) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER }).trim();
/**
 * File-content memoization keyed by path + mtime: a single run parses these
 * documents many times, and an edit between calls (e.g. tests rewriting the
 * config) busts the entry instead of going stale.
 */
export const fileMemo = (cache, file, parse) => {
  const stamp = statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = parse(readFileSync(file, "utf8"));
  cache.set(file, { stamp, value });
  return value;
};
export const processConfigCache = new Map();
export const processConfig = (root) =>
  fileMemo(processConfigCache, path.join(root, ".agent/process.yaml"), YAML.parse);
export { CHECK_COMMANDS };
/**
 * Git path lookups are stable for a given worktree root, and every
 * save/load/metric/evidence call needs one; memoizing them per process removes
 * most `git rev-parse` spawns without caching anything revision-dependent.
 */
export const gitPathCache = new Map();
export const gitPath = (root, args) => {
  const key = `${path.resolve(root)}\0${args.join("\0")}`;
  if (!gitPathCache.has(key)) gitPathCache.set(key, git(args, root));
  return gitPathCache.get(key);
};
export function taskPath(root) {
  return gitPath(root, ["rev-parse", "--path-format=absolute", "--git-path", "agent-task.json"]);
}
/**
 * Last task-file content this process loaded or wrote, per path. A save is
 * refused when the file changed underneath (another runner in the same
 * worktree saved in between), turning a silent lost update into an error.
 */
export const taskSnapshots = new Map();
export function saveTask(task, root) {
  validateTask(task, root);
  const target = taskPath(root);
  requireValue(
    !taskSnapshots.has(target) ||
      !existsSync(target) ||
      readFileSync(target, "utf8") === taskSnapshots.get(target),
    "Task state was changed by another runner since this one loaded it; re-run the command (do not run state-updating runners in parallel)",
  );
  const content = `${JSON.stringify(task, null, 2)}\n`;
  writeFileSync(`${target}.tmp`, content, { mode: 0o600 });
  renameSync(`${target}.tmp`, target);
  taskSnapshots.set(target, content);
}
export function loadTask(root) {
  const target = taskPath(root);
  requireValue(
    existsSync(target),
    "Task not initialized; run loop:state --init <spec.json> --task <id> --runtime <runtime> --implementer <id>",
  );
  const content = readFileSync(target, "utf8");
  const task = JSON.parse(content);
  validateTask(task, root);
  taskSnapshots.set(target, content);
  return task;
}
/**
 * Fingerprint of the spec a review judged against: goal, acceptance criteria
 * (ids and text), non-goals and assumptions. Any change disqualifies the
 * review as an incremental-review base.
 */
export const acceptanceCriteriaHash = (spec) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        goal: spec?.goal ?? null,
        acceptanceCriteria: (spec?.acceptanceCriteria ?? []).map((ac) => [ac.id, ac.text]),
        nonGoals: spec?.nonGoals ?? [],
        assumptions: spec?.assumptions ?? [],
      }),
    )
    .digest("hex");
export function history(task, event, details = {}) {
  task.history.push({
    state: task.state,
    event,
    head: task.head,
    at: new Date().toISOString(),
    ...details,
  });
}
export function invalidate(task) {
  task.verification = {};
  task.review = null;
  task.aftercare = null;
  task.assessment = null;
  task.agentAssessment = null;
  task.skills = [];
}
/**
 * changedPaths (committed ∪ worktree) with the committed diff memoized per
 * (root, base, head): the committed set is fixed for a revision while the
 * worktree set is re-read every call so uncommitted edits never go stale.
 */
export const committedPathsCache = new Map();
/**
 * PR base→head paths for aftercare gating; unreadable revisions return [] so
 * checkAftercare fails closed (SKIPPED never accepted on an unknown diff).
 */
export function safeChangedPaths(root, task) {
  try {
    return readChangedPathsRevisioned(root, task.baseHead, task.head);
  } catch {
    return [];
  }
}
export function readChangedPathsRevisioned(root, baseHead, head) {
  // `baseHead`/`head` are the caller's just-read resolved SHAs; keying and
  // diffing on resolved positions means a moved ref can never alias a stale
  // entry.
  const key = `${path.resolve(root)}${baseHead}${head}`;
  if (!committedPathsCache.has(key))
    committedPathsCache.set(key, readBranchChangedPaths({ base: baseHead, cwd: root }));
  const worktree = readWorktreeChangedPaths({ cwd: root });
  return [...new Set([...committedPathsCache.get(key), ...worktree])].sort();
}
/**
 * Paths vitest can relate tests to for `--verify unit --scope affected`:
 * testable source extensions outside e2e/ (Playwright) and metadata-only
 * paths. Non-matching files drop out of the candidate set; an empty set
 * reverts to the full suite. A matching file with no related tests (e.g. a
 * root config) still makes `vitest related` exit non-zero — that loud
 * failure is intentional; re-run with full scope.
 */
export const UNIT_RELATED_PATTERN = /\.(?:cjs|js|jsx|mjs|mts|cts|ts|tsx)$/;
export function isUnitRelatedPath(filePath) {
  const file = normalizeChangedPath(filePath);
  return !isMetadataOnlyPath(file) && !file.startsWith("e2e/") && UNIT_RELATED_PATTERN.test(file);
}

/**
 * Revision-change invalidation (#953): whenever head or base moves, every
 * recorded verification becomes stale — there is no local evidence reuse.
 * Review, aftercare, reviewCi, assessment, and skills invalidate wholesale.
 */
export function invalidateRevision(task) {
  task.verification = {};
  task.review = null;
  task.aftercare = null;
  task.reviewCi = null;
  task.assessment = null;
  task.agentAssessment = null;
  task.skills = [];
}
/**
 * Machine-derived part of an assessment. When a new revision leaves all of it
 * unchanged, the agent's recorded judgment still describes the change class
 * and can carry over; any difference requires a fresh --assessment.
 */
export function machineShape(assessment) {
  if (!assessment?.risk) return null;
  return JSON.stringify({
    machine: assessment.risk.machine,
    triggers: [...(assessment.risk.machineFloorTriggers ?? [])].sort(),
    skills: [...(assessment.requiredSkills ?? [])].sort(),
    runtimeRelevant: assessment.runtimeRelevant,
    verification: Object.entries(assessment.verification ?? {}).sort(),
  });
}
export function refreshTask(task, root) {
  const branch = git(["branch", "--show-current"], root);
  requireValue(branch === task.branch, "Task branch changed; restore or start the correct task");
  const head = git(["rev-parse", "HEAD"], root);
  const baseHead = git(["rev-parse", "--verify", `${task.baseRef}^{commit}`], root);
  let changedPaths;
  const paths = () => (changedPaths ??= readChangedPathsRevisioned(root, baseHead, head));
  if (head !== task.head || baseHead !== task.baseHead) {
    const prior = {
      assessment: task.assessment,
      agentAssessment: task.agentAssessment,
      skills: task.skills ?? [],
    };
    const previousVerification = Object.keys(task.verification ?? {}).length;
    invalidateRevision(task);
    task.head = head;
    task.baseHead = baseHead;
    if (!["refine", "incident", "human_gate"].includes(task.state)) task.state = "execute";
    let assessmentCarried = false;
    if (task.state !== "refine" && prior.agentAssessment && machineShape(prior.assessment)) {
      const candidate = computeAssessment(
        { ...task, agentAssessment: prior.agentAssessment },
        paths(),
        root,
      );
      if (machineShape(candidate) === machineShape(prior.assessment)) {
        task.agentAssessment = prior.agentAssessment;
        task.skills = prior.skills;
        assessmentCarried = true;
      }
    }
    history(task, "revision_changed", { assessmentCarried });
    recordMetric(task, root, {
      action: "revision_changed",
      invalidated: previousVerification,
      assessmentCarried,
    });
  }
  task.assessment = computeAssessment(task, paths(), root);
  task.risk = highestTier(task.risk, task.assessment.risk.final);
  return task;
}
export function requireClean(root) {
  requireValue(
    git(["status", "--porcelain"], root) === "",
    "Commit all task changes before recording verification/review or transitioning",
  );
}
export function startTask(args, root) {
  requireValue(
    !existsSync(taskPath(root)),
    "Task already initialized; use existing state or another worktree",
  );
  requireValue(
    args.runtime && args.task && args.implementer,
    "Startup requires runtime, task and implementer",
  );
  requireSafeTaskId(args.task);
  execFileSync(process.execPath, ["scripts/check-task-worktree.mjs", "--require-clean"], {
    cwd: root,
    stdio: "pipe",
  });
  const spec = readSubmission(args.init, "spec");
  // Open decisions are allowed in REFINE; leaving it requires a complete spec.
  // --model/--profile are still accepted by the argument parser but no longer used.
  const configuration = { runtime: resolveRuntime({ runtime: args.runtime, root }) };
  const task = {
    version: 2,
    taskId: args.task,
    implementer: args.implementer,
    state: "refine",
    head: git(["rev-parse", "HEAD"], root),
    baseRef: args.base ?? "origin/preview",
    baseHead: git(["rev-parse", "--verify", `${args.base ?? "origin/preview"}^{commit}`], root),
    branch: git(["branch", "--show-current"], root),
    risk: spec.predictedRisk,
    attempt: 0,
    spec,
    configuration,
    skills: [],
    verification: {},
    counters: { review: 0, ci: 0, sameFailure: 0 },
    history: [],
  };
  history(task, "initialized");
  saveTask(task, root);
  return task;
}
export function resolveLoopStep({ task, state, event, exit = {}, root = process.cwd() }) {
  requireValue(task, "Persisted task is required; a caller-supplied state is not sufficient");
  validateTask(task, root);
  requireValue(!state || state === task.state, "Requested state does not match persisted task");
  const config = processConfig(root);
  if (!event)
    return { state: task.state, stateConfig: config.states[task.state], ...task.configuration };
  const nextState = config.states[task.state]?.on?.[event];
  requireValue(nextState, `event ${event} is not allowed from ${task.state}`);
  validateTransition({ task, event, exit, limits: config.limits, root });
  return { state: task.state, event, nextState, ...task.configuration };
}
export function transitionTask(task, event, exit, root) {
  const step = resolveLoopStep({ task, event, exit, root });
  const from = task.state;
  history(task, event, { exit });
  if (event === "findings") task.counters.review += 1;
  if (event === "ci_failure") {
    task.counters.ci += 1;
    // #958: 失敗checkレコードを未解決として保持し、execute readyがブロックする。
    // 複数check同時失敗は配列で一括記録。同checkの未解決レコードは
    // 最新の抽出で置き換える（同じcheckが何度も失敗しても重複しない）。
    const records = Array.isArray(exit.ciFailure) ? exit.ciFailure : [exit.ciFailure];
    task.ciFailures = task.ciFailures ?? [];
    for (const record of records) {
      const stale = task.ciFailures.findIndex((f) => f.check === record.check && !f.resolvedAt);
      if (stale >= 0) task.ciFailures.splice(stale, 1);
      task.ciFailures.push({
        ...record,
        reproduction: exit.reproduction,
        recordedAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedHead: null,
      });
    }
  }
  // Evidence is not wiped here: nothing has changed yet. Invalidation happens
  // only on real revision change in refreshTask, so a dismissed finding or a
  // metadata-only fix does not force full re-verification.
  if (event === "resolved") {
    task.counters.sameFailure = 0;
    task.lastFailure = null;
  }
  task.state = step.nextState;
  const limits = processConfig(root).limits;
  if (
    (event === "findings" && task.counters.review >= limits.review_max_rounds) ||
    (event === "ci_failure" &&
      (task.counters.ci >= limits.ci_fix_max_rounds ||
        // AC4: ローカルで再現できないCI失敗は修復推測せずINCIDENT送り
        exit.reproduction?.result === "not_reproduced"))
  )
    task.state = "incident";
  recordMetric(task, root, { action: "transition", event, from, to: task.state });
  return task;
}
export function recordFailure(task, signature, root) {
  task.attempt += 1;
  task.counters.sameFailure =
    task.lastFailure?.signature === signature ? task.counters.sameFailure + 1 : 1;
  task.lastFailure = { signature, head: task.head };
  history(task, "verification_failed", { signature });
  const from = task.state;
  if (task.counters.sameFailure >= processConfig(root).limits.same_failure_max)
    task.state = "incident";
  if (task.state !== from)
    recordMetric(task, root, {
      action: "transition",
      event: "same_failure_limit",
      from,
      to: task.state,
    });
}
export const STATE_START = "<!-- suzumemo-agent-state:start -->";
export const STATE_END = "<!-- suzumemo-agent-state:end -->";
/** Wire schema marker distinguishing v2 blocks inside the same markers. */
export const STATE_BLOCK_SCHEMA_V2 = "state-block/v2";
/** `i<issue>` task ids anchor their spec to the GitHub issue's Agent Spec. */
export const ISSUE_TASK_PATTERN = /^i(\d+)$/;
/** Canonical spec anchor: issue-linked tasks reference the issue, others carry the spec inline. */
export const specRefForTask = (task) => {
  const issue = ISSUE_TASK_PATTERN.exec(task?.taskId ?? "")?.[1];
  return issue ? `issue#${issue}` : "inline";
};
/**
 * The section of an issue body that is the spec's canonical source: the text
 * between `## Agent Spec` and the next `## ` heading (or end of body).
 */
export function extractAgentSpecSection(issueBody) {
  const match = /^## Agent Spec\s*$/m.exec(issueBody ?? "");
  if (!match) return null;
  const rest = issueBody.slice(match.index + match[0].length).replace(/^\r?\n/, "");
  const end = /^## /m.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}
/** Whitespace-insensitive normalization so the fingerprint survives refetch/formatting. */
export const normalizeSpecSection = (section) =>
  String(section ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
/** Fingerprint of the issue's Agent Spec section: detects edits between restore attempts. */
export function specSectionFingerprint(issueBody) {
  const section = extractAgentSpecSection(issueBody);
  if (section === null) return null;
  return createHash("sha256").update(normalizeSpecSection(section)).digest("hex");
}
/**
 * Canonical hash over the issue-mirrored spec fields — the fingerprint used
 * for inline specs (self-contained in the block) and for the local record.
 */
export const specFingerprint = (spec) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        goal: spec?.goal ?? null,
        acceptanceCriteria: (spec?.acceptanceCriteria ?? []).map((ac) => [ac.id, ac.text]),
        nonGoals: spec?.nonGoals ?? [],
        verificationStrategy: spec?.verificationStrategy ?? [],
        predictedRisk: spec?.predictedRisk ?? null,
      }),
    )
    .digest("hex");
export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * state-block/v2 (#954): only what restore and the PR gate need — no history,
 * no configuration blob, no per-run verification details, no spec prose for
 * issue-linked tasks (the issue's Agent Spec is canonical; the fingerprint
 * pins the version the task was worked against). `spec.fingerprint` anchors
 * the issue's Agent Spec section hash at init/--spec time; when it is missing
 * (fetch degraded) the spec is shipped inline instead, keeping the block
 * self-sufficient rather than unverifiable.
 */
export function compactTaskForExport(task) {
  const ref = specRefForTask(task);
  const spec = task.spec ?? {};
  // The anchor hash lives on the task for full specs (stamped at init/--spec)
  // and inside the reference itself for v2-restored tasks.
  const issueFingerprint =
    task.specFingerprint ?? (typeof spec.fingerprint === "string" ? spec.fingerprint : null);
  const anchored = ref !== "inline" && typeof issueFingerprint === "string";
  const review = task.review ? { ...task.review } : null;
  // A recorded delta review's findings/AC evidence already cover the whole
  // head — the deltaFrom pointer only validates against local history, which
  // the block no longer carries, so it cannot be re-verified and is dropped.
  if (review) delete review.deltaFrom;
  const findings = task.findings;
  const deferred = (findings ?? [])
    .filter((finding) => finding.status === "deferred")
    .map(({ id, severity, followUp }) => ({ id, severity, followUp }));
  const verification = {};
  for (const [kind, evidence] of Object.entries(task.verification ?? {})) {
    const appliesTo = evidence?.appliesTo ?? evidence;
    verification[kind] = {
      head: appliesTo?.head ?? null,
      baseHead: appliesTo?.baseHead ?? null,
      exitCode: evidence?.summary?.exitCode ?? (evidence?.success === true ? 0 : 1),
    };
  }
  const unresolvedCi = (task.ciFailures ?? []).filter((failure) => !failure?.resolvedAt);
  const omitted = (task.history?.length ?? 0) + (task.historyOmitted ?? 0);
  return {
    schema: STATE_BLOCK_SCHEMA_V2,
    version: task.version ?? 2,
    taskId: task.taskId,
    implementer: task.implementer,
    runtime: task.configuration?.runtime?.name ?? null,
    branch: task.branch,
    state: task.state,
    head: task.head,
    baseRef: task.baseRef,
    baseHead: task.baseHead,
    risk: task.risk,
    attempt: task.attempt ?? 0,
    skills: task.skills ?? [],
    spec: {
      fingerprint: anchored ? issueFingerprint : specFingerprint(spec),
      ref: anchored ? ref : "inline",
      predictedRisk: spec.predictedRisk ?? null,
      acIds: (spec.acceptanceCriteria ?? spec.acIds?.map((id) => ({ id })) ?? []).map(
        (ac) => ac.id,
      ),
      openDecisions: spec.openMaterialDecisions?.length ?? spec.openDecisions ?? 0,
    },
    ...(anchored ? {} : { specInline: spec }),
    agentAssessment: task.agentAssessment ?? null,
    ...(review ? { review } : {}),
    ...(findings === undefined || (review && sameJson(findings, review.findings))
      ? {}
      : { findings }),
    ...(deferred.length ? { deferredFindings: deferred } : {}),
    ...(unresolvedCi.length ? { ciFailures: unresolvedCi } : {}),
    ...(task.reviewCi ? { reviewCi: task.reviewCi } : {}),
    ...(task.aftercare ? { aftercare: task.aftercare } : {}),
    verification,
    counters: {
      review: task.counters?.review ?? 0,
      ci: task.counters?.ci ?? 0,
      sameFailure: task.counters?.sameFailure ?? 0,
    },
    ...(omitted > 0 ? { historyOmitted: omitted } : {}),
  };
}
/** Inverse of the v1 reference compaction; plain (legacy) blocks pass through unchanged. */
export function hydrateExportedTask(task) {
  if (task?.schema === STATE_BLOCK_SCHEMA_V2) return hydrateStateBlockV2(task);
  // #953: legacy blocks may carry the removed reuse/lane fields — ignore them.
  delete task.lane;
  if (task.assessment && typeof task.assessment === "object") delete task.assessment.lane;
  for (const evidence of Object.values(task.verification ?? {})) delete evidence?.reuse;
  const review = task.review;
  if (review && task.findings === undefined && Array.isArray(review.findings))
    task.findings = structuredClone(review.findings);
  for (const entry of task.history ?? []) {
    if (entry?.event !== "review_recorded" || entry.sameAsReview !== true) continue;
    delete entry.sameAsReview;
    requireValue(review && review.head === entry.head, "State block review reference is broken");
    entry.findings = structuredClone(review.findings);
    entry.acceptanceCriteria = structuredClone(review.acceptanceCriteria);
  }
  return task;
}
/**
 * v2 → task: rebuilds the schema-required local fields the block omits.
 * history starts empty (the omitted count is preserved), configuration is
 * reduced to the runtime name (restore re-resolves the full adapter config),
 * and minimal verification evidence is re-derived so `currentEvidence` and
 * `success` checks behave exactly as on the emitting task.
 */
export function hydrateStateBlockV2(block) {
  const task = {
    version: 2,
    taskId: block.taskId,
    implementer: block.implementer,
    state: block.state,
    head: block.head,
    baseRef: block.baseRef,
    baseHead: block.baseHead,
    branch: block.branch,
    risk: block.risk,
    attempt: block.attempt ?? 0,
    spec: block.spec?.ref === "inline" ? (block.specInline ?? block.spec) : block.spec,
    configuration: { runtime: { name: block.runtime } },
    skills: block.skills ?? [],
    verification: {},
    counters: {
      review: block.counters?.review ?? 0,
      ci: block.counters?.ci ?? 0,
      sameFailure: block.counters?.sameFailure ?? 0,
    },
    history: [],
    ...(block.historyOmitted ? { historyOmitted: block.historyOmitted } : {}),
    agentAssessment: block.agentAssessment ?? null,
  };
  for (const [kind, evidence] of Object.entries(block.verification ?? {})) {
    task.verification[kind] = {
      head: evidence?.head,
      baseHead: evidence?.baseHead,
      success: evidence?.exitCode === 0,
      summary: { exitCode: evidence?.exitCode },
    };
  }
  if (block.review) task.review = block.review;
  if (task.review && block.findings === undefined && Array.isArray(task.review.findings))
    task.findings = structuredClone(task.review.findings);
  else if (block.findings !== undefined) task.findings = block.findings;
  if (block.deferredFindings) task.deferredFindings = block.deferredFindings;
  if (block.ciFailures) task.ciFailures = block.ciFailures;
  if (block.reviewCi) task.reviewCi = block.reviewCi;
  if (block.aftercare) task.aftercare = block.aftercare;
  return task;
}
export const DEFERRED_START = "<!-- suzumemo-agent-deferred:start -->";
export const DEFERRED_END = "<!-- suzumemo-agent-deferred:end -->";
/**
 * Human-readable list of deferred findings, published next to the state
 * block so reviewers see what was postponed and where it went. Lives outside
 * the JSON markers (parseStateBlock requires exactly ```json ... ```).
 */
export function deferredBlock(task) {
  const deferred = (task.findings ?? []).filter((finding) => finding.status === "deferred");
  if (!deferred.length) return "";
  const items = deferred
    .map((finding) => `- \`${finding.id}\` (${finding.severity}) → ${finding.followUp}`)
    .join("\n");
  return `${DEFERRED_START}\nDeferred findings (follow-up issues):\n${items}\n${DEFERRED_END}`;
}
export function stateBlock(task) {
  return `${STATE_START}\n\`\`\`json\n${JSON.stringify(compactTaskForExport(task), null, 1)}\n\`\`\`\n${STATE_END}`;
}
export function nextActions(task, root) {
  const missing = missingRequirements(task, root);
  const actions = [];
  for (const item of missing) {
    if (item === "assessment" || item === "assessment(invalid)")
      actions.push("node scripts/loop-runner.mjs --assessment <file>");
    else if (item === "openMaterialDecisions")
      actions.push("resolve spec openMaterialDecisions or --event decision_required");
    else if (item === "verify:prepush") actions.push("pnpm verify:prepush");
    else if (item.startsWith("verify:")) {
      const verify =
        task.state === "review"
          ? "node scripts/loop-runner.mjs --verify-required (full unit; may run alongside the reviewer)"
          : "node scripts/loop-runner.mjs --verify-required";
      if (!actions.includes(verify)) actions.push(verify);
    } else if (item.startsWith("skill:"))
      actions.push(`read skills/${item.slice(6)}/SKILL.md then --assessment --skills`);
    else if (item === "review") actions.push("node scripts/loop-runner.mjs --review <file>");
    else if (item === "independent-review")
      actions.push("obtain a fresh-context independent review");
    else if (item.startsWith("finding:"))
      actions.push(`resolve finding ${item.slice(8)} then re-review (--event findings)`);
    else if (item === "aftercare") actions.push("node scripts/loop-runner.mjs --aftercare <pr>");
    else if (item === "spec:acceptanceCriteria")
      actions.push("fix --spec acceptanceCriteria (unique non-empty ids)");
    else actions.push(item);
  }
  if (actions.length === 0) {
    const ready = {
      refine: "--event ready",
      execute: "--event ready",
      review: "--event clean",
      aftercare: "--event ready",
    }[task.state];
    if (ready) actions.push(`node scripts/loop-runner.mjs ${ready}`);
    if (task.state === "done") actions.push("done");
  }
  return actions;
}
/** Compact task snapshot for CLI output — never contains spec/history/raw logs. */
/** Mirrors `.agent/process.yaml` states[*].workflow; a test keeps them in sync. */
export const STATE_WORKFLOWS = {
  refine: ".agent/workflow/refine.md",
  execute: ".agent/workflow/execute.md",
  review: ".agent/workflow/review.md",
  aftercare: ".agent/workflow/aftercare.md",
  incident: ".agent/workflow/incident.md",
};
