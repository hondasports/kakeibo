import {
  appendFileSync,
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  writeSync,
  closeSync,
  statSync,
  rmSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { decideProfile, resolveAgentProfile } from "./resolve-agent-profile.mjs";
import { readChangedPaths } from "./suggest-skills.mjs";
import { isMetadataOnlyPath, normalizeChangedPath } from "./classify-e2e-relevance.mjs";
import { validateAssessment } from "./review-depth.mjs";
import {
  validateTask,
  validateSpec,
  validateTransition,
  validateReview,
  requireValue,
  computeAssessment,
  highestTier,
  checkAftercare,
  selectChecks,
  missingRequirements,
  verificationSummary,
  aftercareSummary,
  verificationReusable,
  CHECK_COMMANDS,
} from "./loop-policy.mjs";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const git = (args, root) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const processConfig = (root) =>
  YAML.parse(readFileSync(path.join(root, ".agent/process.yaml"), "utf8"));
export { CHECK_COMMANDS };
export function taskPath(root) {
  return git(["rev-parse", "--path-format=absolute", "--git-path", "agent-task.json"], root);
}
export function saveTask(task, root) {
  validateTask(task, root);
  const target = taskPath(root);
  writeFileSync(`${target}.tmp`, `${JSON.stringify(task, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${target}.tmp`, target);
}
export function loadTask(root) {
  const target = taskPath(root);
  requireValue(
    existsSync(target),
    "Task not initialized; run loop:state --init <spec.json> --task <id> --runtime <runtime> --implementer <id>",
  );
  const task = readJson(target);
  validateTask(task, root);
  return task;
}
function history(task, event, details = {}) {
  task.history.push({
    state: task.state,
    event,
    head: task.head,
    at: new Date().toISOString(),
    ...details,
  });
}
function invalidate(task) {
  task.verification = {};
  task.review = null;
  task.aftercare = null;
  task.assessment = null;
  task.agentAssessment = null;
  task.skills = [];
}
/** SHA-256 of the merge-base feature patch; null means unknown → fail closed. */
function featurePatchSha256(task, root, head = task.head) {
  try {
    return createHash("sha256")
      .update(git(["diff", "--binary", "--no-renames", `${task.baseRef}...${head}`], root))
      .digest("hex");
  } catch {
    return null;
  }
}
/**
 * Paths vitest can relate tests to for `--verify unit --scope affected`:
 * testable source extensions outside e2e/ (Playwright) and metadata-only
 * paths. Non-matching files drop out of the candidate set; an empty set
 * reverts to the full suite. A matching file with no related tests (e.g. a
 * root config) still makes `vitest related` exit non-zero — that loud
 * failure is intentional; re-run with full scope.
 */
const UNIT_RELATED_PATTERN = /\.(?:cjs|js|jsx|mjs|mts|cts|ts|tsx)$/;
function isUnitRelatedPath(filePath) {
  const file = normalizeChangedPath(filePath);
  return !isMetadataOnlyPath(file) && !file.startsWith("e2e/") && UNIT_RELATED_PATTERN.test(file);
}

/** Increment paths between two commits; null on failure → fail closed. */
function incrementChangedPaths(from, to, root) {
  try {
    return git(
      ["diff", "--name-only", "--no-renames", "--diff-filter=ACDMRTUXB", "-z", from, to],
      root,
    )
      .split("\0")
      .map(normalizeChangedPath)
      .filter(Boolean);
  } catch {
    return null;
  }
}
/**
 * Revision-change invalidation: verification evidence may be carried over only
 * when both the feature patch and the verified tree are byte-identical to the
 * new revision — the same commands over the same tree inputs reproduce the
 * same result. Commands can still read inputs outside the tree (toolchain,
 * gitignored files, environment); that residual is accepted because CI
 * re-executes every required check on the real PR head. `run` keeps recording
 * where the verification actually executed and never gets rewritten.
 * Everything else (review, aftercare, assessment, skills) still invalidates
 * wholesale.
 *
 * A second, narrower reuse path covers increments whose paths are all
 * metadata-only (docs prose, issue templates, git hooks). Lint and build
 * cannot observe that content at all. Unit CAN: the full vitest suite
 * includes workflow/docs contract tests that read .md files. That is sound
 * only because `process` is unconditionally required, never extended, and its
 * suite contains every metadata-reading test — a mandatory fresh process
 * run decides whether a metadata increment is actually green. The guard test
 * in loop-runner.test.mjs keeps that containment invariant true.
 */
function invalidateRevision(task, root, head, baseHead) {
  const patchSha256 = featurePatchSha256(task, root, head);
  let headTree = null;
  try {
    headTree = git(["rev-parse", `${head}^{tree}`], root);
  } catch {
    headTree = null;
  }
  const incrementPaths =
    head !== task.head && baseHead === task.baseHead
      ? incrementChangedPaths(task.head, head, root)
      : null;
  const metadataOnlyIncrement =
    incrementPaths !== null &&
    incrementPaths.length > 0 &&
    incrementPaths.every(isMetadataOnlyPath);
  const kept = {};
  const reused = [];
  for (const [kind, evidence] of Object.entries(task.verification ?? {})) {
    const fingerprintReusable = verificationReusable(evidence, {
      patchSha256,
      headTree,
      contractVersion: EVIDENCE_CONTRACT_VERSION,
    });
    const incrementReusable =
      !fingerprintReusable &&
      metadataOnlyIncrement &&
      kind !== "process" &&
      // lint runs `oxfmt --check`, which observes YAML/JSON inside
      // .github/ISSUE_TEMPLATE/ — only .md (ignored) and dot-free
      // (extensionless) .husky hooks are provably invisible to it.
      (kind !== "lint" ||
        incrementPaths.every(
          (p) =>
            p.endsWith(".md") || (p.startsWith(".husky/") && !p.split("/").pop().includes(".")),
        )) &&
      evidence?.success === true &&
      evidence?.appliesTo?.contractVersion === EVIDENCE_CONTRACT_VERSION &&
      evidence?.appliesTo?.head === task.head &&
      evidence?.appliesTo?.baseHead === task.baseHead;
    if (!fingerprintReusable && !incrementReusable) continue;
    evidence.reuse = {
      basis: fingerprintReusable ? "identical_patch_and_tree" : "metadata_only_increment",
      from: { head: evidence.appliesTo.head, baseHead: evidence.appliesTo.baseHead },
      at: new Date().toISOString(),
    };
    if (incrementReusable) evidence.reuse.incrementPaths = incrementPaths;
    evidence.appliesTo.head = head;
    evidence.appliesTo.baseHead = baseHead;
    kept[kind] = evidence;
    reused.push(kind);
  }
  task.verification = kept;
  task.review = null;
  task.aftercare = null;
  task.assessment = null;
  task.agentAssessment = null;
  task.skills = [];
  return reused;
}
export function refreshTask(task, root) {
  const branch = git(["branch", "--show-current"], root);
  requireValue(branch === task.branch, "Task branch changed; restore or start the correct task");
  const head = git(["rev-parse", "HEAD"], root);
  const baseHead = git(["rev-parse", "--verify", `${task.baseRef}^{commit}`], root);
  if (head !== task.head || baseHead !== task.baseHead) {
    const previousVerification = Object.keys(task.verification ?? {}).length;
    const reused = invalidateRevision(task, root, head, baseHead);
    task.head = head;
    task.baseHead = baseHead;
    if (!["refine", "incident", "human_gate"].includes(task.state)) task.state = "execute";
    history(task, "revision_changed", { reusedVerification: reused });
    recordMetric(task, root, {
      action: "revision_changed",
      reused: reused.length,
      invalidated: previousVerification - reused.length,
    });
  }
  task.assessment = computeAssessment(task, readChangedPaths({ base: task.baseRef, cwd: root }));
  task.risk = highestTier(task.risk, task.assessment.risk.final);
  return task;
}
function requireClean(root) {
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
  const spec = readJson(args.init);
  // Open decisions are allowed in REFINE; leaving it requires a complete spec.
  // --model is still accepted by the argument parser but no longer used.
  const configuration = resolveAgentProfile({
    profile: args.profile,
    runtime: args.runtime,
    root,
  });
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
  // REFINE completion fixes the profile from the recorded evaluation before EXECUTE.
  if (task.state === "refine" && event === "ready")
    decideProfile(task, { root, strict: true, trigger: "refine_ready" });
  history(task, event, { exit });
  if (event === "findings") task.counters.review += 1;
  if (event === "ci_failure") task.counters.ci += 1;
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
    (event === "ci_failure" && task.counters.ci >= limits.ci_fix_max_rounds)
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
export const EVIDENCE_CONTRACT_VERSION = 1;
/**
 * Best-effort metrics sink shared across linked worktrees (the common git
 * dir), never the worktree-private `--git-path` location. Failures never
 * block the caller — observability must not become a gate.
 */
const metricsPath = (root) =>
  path.join(
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"], root),
    "agent-metrics.jsonl",
  );
export function recordMetric(task, root, entry) {
  try {
    appendFileSync(
      metricsPath(root),
      `${JSON.stringify({
        at: new Date().toISOString(),
        taskId: task?.taskId ?? null,
        state: task?.state ?? null,
        head: task?.head ?? null,
        baseHead: task?.baseHead ?? null,
        ...entry,
      })}\n`,
    );
  } catch {
    // Metrics are best-effort; a broken sink must not break the loop.
  }
}
const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const requireSafeTaskId = (taskId) =>
  requireValue(
    typeof taskId === "string" && SAFE_TASK_ID.test(taskId) && !taskId.includes(".."),
    `Invalid task id for artifact paths: ${taskId}`,
  );
const evidenceRoot = (root) =>
  git(["rev-parse", "--path-format=absolute", "--git-path", "agent-evidence"], root);
const evidenceDir = (task, root) => {
  requireSafeTaskId(task.taskId);
  return path.join(evidenceRoot(root), task.taskId, task.head.slice(0, 12));
};
// Persisted manifests store paths relative to the evidence root so state blocks
// stay portable and never leak local filesystem layout into the PR body.
const resolveArtifactPath = (root, stored) =>
  path.isAbsolute(stored) ? stored : path.join(evidenceRoot(root), stored);
const lastLines = (text, count = 20) => text.trimEnd().split("\n").slice(-count);
export function runVerification(
  task,
  kind,
  root,
  run = (command, context) =>
    spawnSync(command[0], command.slice(1), {
      cwd: root,
      stdio: ["ignore", context.fd, context.fd],
    }),
  { scope = "full" } = {},
) {
  requireValue(task.state === "execute", "Verification runs in execute");
  requireValue(CHECK_COMMANDS[kind], `Unknown verification kind: ${kind}`);
  requireValue(["full", "affected"].includes(scope), `Unknown verification scope: ${scope}`);
  requireValue(
    scope !== "affected" || kind === "unit",
    "--scope affected is supported for unit only; CI still runs the full suite",
  );
  requireClean(root);
  const before = { head: task.head, baseHead: task.baseHead };
  delete task.verification[kind];
  // --scope affected narrows `unit` to vitest related over the task's changed
  // paths. Only files vitest can relate tests to are passed (testable source
  // extensions, present on disk, outside e2e/ and metadata-only paths). A file
  // with no related tests makes vitest exit non-zero; that is a normal failure,
  // not an implicit full-suite fallback. An empty candidate set reverts to the
  // full command list and is recorded as scope "full".
  let commands = CHECK_COMMANDS[kind];
  let affectedFiles = null;
  if (kind === "unit" && scope === "affected") {
    affectedFiles = readChangedPaths({ base: task.baseRef, cwd: root })
      .map(normalizeChangedPath)
      .filter((file) => isUnitRelatedPath(file) && existsSync(path.join(root, file)));
    if (affectedFiles.length > 0)
      commands = [["pnpm", "exec", "vitest", "related", ...affectedFiles, "--run"]];
  }
  const appliedScope = commands === CHECK_COMMANDS[kind] ? "full" : scope;
  const startedAt = Date.now();
  const dir = evidenceDir(task, root);
  mkdirSync(dir, { recursive: true });
  const artifactPath = path.join(dir, `${kind}-${startedAt}.log`);
  const fd = openSync(artifactPath, "w");
  try {
    for (const command of commands) {
      writeSync(fd, `$ ${command.join(" ")}\n`);
      const result = run(command, { fd, artifactPath });
      writeSync(fd, `[exit ${result.status}]\n`);
      if (result.status !== 0) {
        const signature = createHash("sha256")
          .update(JSON.stringify({ kind, command, status: result.status }))
          .digest("hex");
        recordFailure(task, signature, root);
        task.lastFailure.kind = kind;
        recordMetric(task, root, {
          action: "verify",
          kind,
          durationMs: Date.now() - startedAt,
          result: "fail",
          scope: appliedScope,
          signature,
        });
        saveTask(task, root);
        const tail = lastLines(readFileSync(artifactPath, "utf8")).join("\n");
        throw new Error(
          `Verification failed: ${kind} (exit ${result.status}); state=${task.state}; log ${artifactPath}\n${tail}`,
        );
      }
    }
  } finally {
    closeSync(fd);
  }
  refreshTask(task, root);
  requireClean(root);
  requireValue(
    task.head === before.head && task.baseHead === before.baseHead,
    "Revision changed during verification",
  );
  // Null fingerprints keep the evidence valid for this revision but it can
  // never be reused for another — fail-closed.
  const patchSha256 = featurePatchSha256(task, root);
  const log = readFileSync(artifactPath, "utf8");
  task.verification[kind] = {
    run: {
      head: before.head,
      baseHead: before.baseHead,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      scope: appliedScope,
      ...(appliedScope === "affected" ? { affectedFiles } : {}),
    },
    appliesTo: {
      head: before.head,
      baseHead: before.baseHead,
      headTree: git(["rev-parse", `${before.head}^{tree}`], root),
      patchSha256,
      contractVersion: EVIDENCE_CONTRACT_VERSION,
    },
    success: true,
    commands,
    summary: { exitCode: 0, lastLines: lastLines(log, 10) },
    artifact: {
      path: path.relative(evidenceRoot(root), artifactPath),
      sha256: createHash("sha256").update(log).digest("hex"),
      bytes: statSync(artifactPath).size,
    },
  };
  if (task.lastFailure?.kind === kind) {
    task.counters.sameFailure = 0;
    task.lastFailure = null;
  }
  recordMetric(task, root, {
    action: "verify",
    kind,
    durationMs: Date.now() - startedAt,
    result: "pass",
    scope: appliedScope,
    artifactBytes: task.verification[kind].artifact?.bytes ?? null,
  });
  return task;
}
export const STATE_START = "<!-- suzumemo-agent-state:start -->";
export const STATE_END = "<!-- suzumemo-agent-state:end -->";
export function stateBlock(task) {
  return `${STATE_START}\n\`\`\`json\n${JSON.stringify(task, null, 2)}\n\`\`\`\n${STATE_END}`;
}
function nextActions(task) {
  const missing = missingRequirements(task);
  const actions = [];
  for (const item of missing) {
    if (item === "assessment") actions.push("node scripts/loop-runner.mjs --assessment <file>");
    else if (item === "openMaterialDecisions")
      actions.push("resolve spec openMaterialDecisions or --event decision_required");
    else if (item.startsWith("verify:"))
      actions.push(`node scripts/loop-runner.mjs --verify ${item.slice(7)}`);
    else if (item.startsWith("skill:"))
      actions.push(`read skills/${item.slice(6)}/SKILL.md then --assessment --skills`);
    else if (item === "review") actions.push("node scripts/loop-runner.mjs --review <file>");
    else if (item === "independent-review")
      actions.push("obtain a fresh-context independent review");
    else if (item.startsWith("finding:"))
      actions.push(`resolve finding ${item.slice(8)} then re-review (--event findings)`);
    else if (item === "aftercare") actions.push("node scripts/loop-runner.mjs --aftercare <pr>");
    else if (item.startsWith("profile:"))
      actions.push(`complete profile input ${item.slice(8)} via --assessment`);
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
export function summarizeTask(task) {
  return {
    taskId: task.taskId,
    state: task.state,
    head: task.head,
    baseHead: task.baseHead,
    risk: task.risk,
    profile: {
      selected: task.configuration?.selection?.selected,
      source: task.configuration?.selection?.source,
    },
    missing: missingRequirements(task),
    verification: verificationSummary(task),
    openFindings: (task.findings ?? []).filter((finding) => finding.status === "open").length,
    aftercare: aftercareSummary(task),
    next: nextActions(task),
  };
}
/** Evidence manifest per verification kind — paths/hashes/summaries, never raw logs. */
export function artifactManifest(task, root = process.cwd()) {
  const manifest = {};
  for (const [kind, evidence] of Object.entries(task.verification ?? {})) {
    const artifact = evidence.artifact
      ? {
          path: evidence.artifact.path,
          resolved: resolveArtifactPath(root, evidence.artifact.path),
          sha256: evidence.artifact.sha256,
          bytes: evidence.artifact.bytes,
          available: existsSync(resolveArtifactPath(root, evidence.artifact.path)),
        }
      : null;
    manifest[kind] = {
      success: evidence.success === true,
      run: evidence.run ?? {
        head: evidence.head ?? null,
        baseHead: evidence.baseHead ?? null,
        checkedAt: evidence.checkedAt ?? null,
      },
      appliesTo: evidence.appliesTo ?? null,
      summary: evidence.summary ?? null,
      artifact,
      reuse: evidence.reuse ?? null,
    };
  }
  return manifest;
}
function explainTask(task, root) {
  return {
    ...summarizeTask(task),
    requiredSkills: task.assessment?.requiredSkills ?? [],
    skills: task.skills ?? [],
    riskDetail: {
      retained: task.risk,
      assessment: task.assessment?.risk ?? null,
      agent: task.agentAssessment?.applied_tier ?? null,
    },
    verificationDetail: artifactManifest(task, root),
    profileSource: task.configuration?.profileSource ?? null,
  };
}
export function parseStateBlock(body) {
  requireValue(
    body.split(STATE_START).length === 2 && body.split(STATE_END).length === 2,
    "Exactly one Agent state block is required",
  );
  const match = body
    .split(STATE_START)[1]
    .split(STATE_END)[0]
    .trim()
    .match(/^```json\s*([\s\S]*?)\s*```$/);
  requireValue(match, "Invalid Agent state JSON block");
  return JSON.parse(match[1]);
}
const gh = (args, root) =>
  execFileSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const AFTERCARE_PR_FIELDS =
  "number,state,isDraft,headRefOid,baseRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
function aftercareFetchers(pr, handled, root) {
  return {
    fetchPr: () => JSON.parse(gh(["pr", "view", String(pr), "--json", AFTERCARE_PR_FIELDS], root)),
    fetchFindings: () => {
      const args = ["scripts/collect-pr-findings.mjs", "--pr", String(pr)];
      if (handled) args.push("--handled", handled);
      const raw = execFileSync(process.execPath, args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return JSON.parse(raw.slice(raw.indexOf("{")));
    },
  };
}
const checkPending = (check) =>
  (check.status && check.status !== "COMPLETED") ||
  (check.state && ["PENDING", "EXPECTED"].includes(check.state));
/** Compact per-poll snapshot for --watch-aftercare; never throws on the gate. */
export function aftercareSnapshot(prFields, task, findings, pr) {
  const checks = selectChecks(prFields.statusCheckRollup ?? []);
  const checkName = (check) => check.name ?? check.context ?? "";
  const pending = checks.filter(checkPending).map(checkName);
  const failed = checks
    .filter(
      (check) =>
        !checkPending(check) &&
        !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion ?? check.state),
    )
    .map(checkName);
  let ready = false;
  try {
    checkAftercare(prFields, task, findings);
    ready = true;
  } catch {
    ready = false;
  }
  return {
    pr: prFields.number ?? pr,
    ready,
    pending,
    failed,
    unhandledFindings: findings?.unhandledCount ?? null,
    unresolvedThreads: findings?.unresolvedThreadCount ?? null,
    mergeable: prFields.mergeable ?? null,
    mergeStateStatus: prFields.mergeStateStatus ?? null,
    reviewDecision: prFields.reviewDecision ?? null,
    head: prFields.headRefOid ?? null,
    baseHead: prFields.baseRefOid ?? null,
  };
}
const defaultSleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/**
 * Poll the PR until the aftercare gate would pass or `maxSeconds` elapse.
 * Only signature changes are emitted as events; unchanged polls stay silent.
 * On success the normal aftercare evidence path runs before returning.
 */
export function watchAftercare(
  task,
  pr,
  root,
  {
    handled,
    intervalSeconds = 60,
    maxSeconds = 900,
    fetchPr,
    fetchFindings,
    now,
    sleep,
    record,
  } = {},
) {
  requireValue(task.state === "aftercare", "GitHub aftercare runs in aftercare");
  const tick = now ?? (() => Date.now());
  const pause = sleep ?? defaultSleep;
  // Injected fetchers use the exact same shape as production so tests exercise
  // the real call path instead of hiding it behind a different seam.
  const defaults = aftercareFetchers(pr, handled, root);
  const pollPr = fetchPr ?? defaults.fetchPr;
  const pollFindings = fetchFindings ?? defaults.fetchFindings;
  const recordAftercare = record ?? ((t) => githubAftercare(t, pr, handled, root));
  const events = [];
  const deadline = tick() + maxSeconds * 1000;
  let signature = null;
  let polls = 0;
  while (true) {
    polls += 1;
    let snapshot;
    try {
      snapshot = aftercareSnapshot(pollPr(), task, pollFindings(), pr);
    } catch (error) {
      // A transient fetch failure is a poll event, not a watch failure.
      snapshot = { pr, ready: false, error: String(error?.message ?? error) };
    }
    const nextSignature = JSON.stringify(snapshot);
    if (nextSignature !== signature) events.push({ ...snapshot, changed: signature !== null });
    signature = nextSignature;
    if (snapshot.ready) {
      task = recordAftercare(task);
      recordMetric(task, root, { action: "watch_aftercare", polls, ready: true });
      return { task, events, ready: true };
    }
    if (tick() >= deadline) {
      recordMetric(task, root, { action: "watch_aftercare", polls, ready: false });
      return { task, events, ready: false };
    }
    pause(intervalSeconds * 1000);
  }
}
export function githubAftercare(task, pr, handled, root) {
  requireValue(task.state === "aftercare", "GitHub aftercare runs in aftercare");
  task.aftercare = null;
  saveTask(task, root);
  const { fetchPr, fetchFindings } = aftercareFetchers(pr, handled, root);
  const before = fetchPr();
  const findings = fetchFindings();
  const evidence = checkAftercare(before, task, findings);
  const after = fetchPr();
  checkAftercare(after, task, findings);
  requireValue(
    before.baseRefName === after.baseRefName && before.headRefOid === after.headRefOid,
    "PR changed during aftercare",
  );
  task.aftercare = evidence;
  history(task, "github_verified", { pr: pr.number ?? pr });
  recordMetric(task, root, { action: "aftercare", pr: evidence.pr, ready: evidence.ready });
  return task;
}
/**
 * Bundle everything a fresh-context independent reviewer needs into one
 * directory: task facts, the exact diff, verification evidence manifest, a
 * review template matching validateReview(), and the governing contracts.
 */
export function buildReviewPacket(task, dir, root) {
  requireValue(task.state === "review", "Review packets are generated in review state");
  requireClean(root);
  mkdirSync(dir, { recursive: true });
  const written = [];
  const write = (name, content) => {
    const file = path.join(dir, name);
    writeFileSync(file, content, { mode: 0o600 });
    written.push(file);
  };
  const diff = git(["diff", "--binary", "--no-renames", `${task.baseRef}...${task.head}`], root);
  const changedPaths = git(["diff", "--name-only", `${task.baseRef}...${task.head}`], root)
    .split("\n")
    .filter(Boolean);
  write("diff.patch", `${diff}\n`);
  write("task-summary.json", `${JSON.stringify(summarizeTask(task), null, 2)}\n`);
  write("verification-manifest.json", `${JSON.stringify(artifactManifest(task, root), null, 2)}\n`);
  write(
    "packet.json",
    `${JSON.stringify(
      {
        taskId: task.taskId,
        head: task.head,
        baseHead: task.baseHead,
        baseRef: task.baseRef,
        branch: task.branch,
        goal: task.spec?.goal ?? null,
        acceptanceCriteria: task.spec?.acceptanceCriteria ?? [],
        nonGoals: task.spec?.nonGoals ?? [],
        assumptions: task.spec?.assumptions ?? [],
        changedPaths,
        risk: task.risk,
        requiredSkills: task.assessment?.requiredSkills ?? [],
        verification: verificationSummary(task),
        verificationPlan: task.assessment?.verificationPlan ?? null,
        reuseCandidates: {
          featurePatchSha256: featurePatchSha256(task, root),
          reusedVerification: Object.entries(task.verification ?? {})
            .filter(([, evidence]) => evidence?.reuse)
            .map(([kind]) => kind),
        },
      },
      null,
      2,
    )}\n`,
  );
  write(
    "review-template.json",
    `${JSON.stringify(
      {
        head: task.head,
        baseHead: task.baseHead,
        reviewer: "",
        independent: task.assessment?.review?.independent === true,
        context: "fresh",
        _notes: [
          "finding.status is open|fixed|dismissed (unique id, non-empty evidence); every prior finding id must appear",
          "deltaFrom (optional): SHA of a previously reviewed head — scopes review to the increment",
          "assessment must satisfy the machine floor, not merely the reviewer's own rating",
        ],
        evidence: [],
        findings: [],
        acceptanceCriteria: (task.spec?.acceptanceCriteria ?? []).map((ac) => ({
          id: ac.id,
          evidence: "",
        })),
        assessment: {
          // Optional fields (applied_tier, verification_load) stay absent —
          // a present-but-empty value fails validation, an absent one is unset.
          risk_assessment: {
            blast_radius: "",
            data_security: "",
            reversibility: "",
            uncertainty: "",
            floor_triggers: [],
          },
          tier_rationale: "",
        },
      },
      null,
      2,
    )}\n`,
  );
  const contracts = path.join(dir, "contracts");
  mkdirSync(path.join(contracts, "required-skills"), { recursive: true });
  for (const [source, name] of [
    [path.join(root, "AGENTS.md"), "AGENTS.md"],
    [path.join(root, ".agent/workflow/review.md"), "workflow-review.md"],
  ])
    if (existsSync(source)) cpSync(source, path.join(contracts, name));
  for (const skill of task.assessment?.requiredSkills ?? []) {
    const source = path.join(root, "skills", skill, "SKILL.md");
    if (existsSync(source)) cpSync(source, path.join(contracts, "required-skills", `${skill}.md`));
  }
  recordMetric(task, root, { action: "review_packet", files: written.length });
  return { taskId: task.taskId, state: task.state, dir, files: written.length };
}
function option(args, index) {
  requireValue(
    args[index + 1] && !args[index + 1].startsWith("--"),
    `${args[index]} requires a value`,
  );
  return args[index + 1];
}
export function parseArguments(args) {
  const out = {};
  const flags = new Set([
    "--export",
    "--assert-started",
    "--status",
    "--explain",
    "--artifacts",
    "--watch-aftercare",
  ]);
  const options = new Set([
    "--init",
    "--task",
    "--implementer",
    "--model",
    "--profile",
    "--runtime",
    "--base",
    "--state",
    "--event",
    "--exit",
    "--assessment",
    "--skills",
    "--verify",
    "--review",
    "--aftercare",
    "--handled",
    "--spec",
    "--restore-pr",
    "--sync-pr",
    "--export-file",
    "--review-packet",
    "--interval-seconds",
    "--scope",
    "--friction-note",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue; // pnpm forwards a bare "--" through to the script
    requireValue(flags.has(arg) || options.has(arg), `unknown option: ${arg}`);
    requireValue(!Object.hasOwn(out, arg.slice(2)), `duplicate option: ${arg}`);
    out[arg.slice(2)] = flags.has(arg) ? true : option(args, i++);
  }
  return out;
}
export function restoreTask(pr, root) {
  const task = parseStateBlock(pr.body);
  requireValue(task.branch === pr.headRefName, "PR state belongs to a different branch");
  requireValue(
    [pr.baseRefName, `origin/${pr.baseRefName}`].includes(task.baseRef),
    "PR target branch changed; select the matching task base",
  );
  requireValue(
    pr.headRefOid === git(["rev-parse", "HEAD"], root),
    "Checkout does not match current PR HEAD",
  );
  requireValue(
    pr.baseRefOid === git(["rev-parse", task.baseRef], root),
    "Fetch the current PR base before restoring",
  );
  refreshTask(task, root);
  saveTask(task, root);
  return task;
}
export function run(args, root = process.cwd(), services = {}) {
  const actions = [
    "init",
    "spec",
    "assessment",
    "verify",
    "review",
    "aftercare",
    "event",
    "restore-pr",
    "sync-pr",
    "export",
    "export-file",
    "review-packet",
    "status",
    "explain",
    "artifacts",
    "assert-started",
    "friction-note",
  ].filter((key) => args[key]);
  requireValue(actions.length <= 1, "Run one task action at a time");
  requireValue(
    !args["watch-aftercare"] || args.aftercare,
    "--watch-aftercare requires --aftercare",
  );
  requireValue(
    args["interval-seconds"] === undefined || args["watch-aftercare"],
    "--interval-seconds requires --watch-aftercare",
  );
  requireValue(args.scope === undefined || args.verify, "--scope requires --verify");
  if (args.init) return startTask(args, root);
  if (args["restore-pr"]) {
    requireValue(!existsSync(taskPath(root)), "A local task already exists");
    const pr = JSON.parse(
      gh(
        [
          "pr",
          "view",
          args["restore-pr"],
          "--json",
          "body,headRefOid,baseRefOid,headRefName,baseRefName",
        ],
        root,
      ),
    );
    return restoreTask(pr, root);
  }
  let task = refreshTask(loadTask(root), root);
  saveTask(task, root); // Persist invalidation even if the requested action fails.
  requireValue(
    !args.state || args.state === task.state,
    "Requested state does not match persisted task",
  );
  if (args["assert-started"]) {
    validateSpec(task.spec, root);
    requireValue(task.state === "execute", "Changes may only be committed in execute state");
    return { taskId: task.taskId, state: task.state, profile: task.configuration.profileSource };
  }
  if (args.status) return task;
  if (args.explain) return explainTask(task, root);
  if (args.artifacts)
    return { taskId: task.taskId, state: task.state, artifacts: artifactManifest(task, root) };
  if (args["review-packet"]) return buildReviewPacket(task, args["review-packet"], root);
  if (args["friction-note"] !== undefined) {
    requireValue(
      typeof args["friction-note"] === "string" && args["friction-note"].trim().length > 0,
      "--friction-note requires non-empty text",
    );
    task.frictionNote = args["friction-note"].trim();
    history(task, "friction_note", { note: task.frictionNote });
    recordMetric(task, root, { action: "friction_note" });
    saveTask(task, root);
    return task;
  }
  if (args.spec) {
    requireValue(task.state === "refine", "Spec changes require refine state");
    task.spec = readJson(args.spec);
    validateSpec(task.spec, root);
    task.risk = highestTier(task.risk, task.spec.predictedRisk);
    invalidate(task);
  }
  if (args.assessment) {
    requireValue(
      ["refine", "execute", "review"].includes(task.state),
      "Assess in refine/execute/review",
    );
    const assessment = readJson(args.assessment);
    requireValue(validateAssessment(assessment).length === 0, "Invalid agent risk assessment");
    task.agentAssessment = assessment;
    task.skills = args.skills?.split(",").filter(Boolean) ?? [];
    refreshTask(task, root);
    // Re-determination runs only past the first decision: changed evaluation
    // inputs can raise the profile; auto selection never moves downward.
    if (task.state !== "refine") decideProfile(task, { root, trigger: "assessment" });
    history(task, "assessed");
  }
  if (args.verify)
    task = runVerification(task, args.verify, root, undefined, { scope: args.scope });
  if (args.review) {
    requireClean(root);
    requireValue(task.state === "review", "Record review in review state");
    const report = readJson(args.review);
    validateReview(task, report);
    task.review = report;
    task.findings = report.findings;
    history(task, "review_recorded", { reviewer: report.reviewer, findings: report.findings });
    refreshTask(task, root);
  }
  if (args.aftercare) {
    requireClean(root);
    if (args["watch-aftercare"]) {
      const interval = args["interval-seconds"];
      if (interval !== undefined)
        requireValue(
          Number.isFinite(Number(interval)) && Number(interval) >= 1,
          "--interval-seconds must be a number >= 1",
        );
      const result = watchAftercare(task, args.aftercare, root, {
        handled: args.handled,
        intervalSeconds: interval === undefined ? undefined : Number(interval),
      });
      task = result.task;
      saveTask(task, root);
      if (!result.ready) return { taskId: task.taskId, state: task.state, watch: result.events };
      return { ...summarizeTask(task), watch: result.events };
    } else {
      task = githubAftercare(task, args.aftercare, args.handled, root);
    }
  }
  if (args.event) {
    if (task.state === "aftercare" && args.event === "ready") {
      const pr = task.aftercare?.pr;
      task.aftercare = null;
      saveTask(task, root);
      requireValue(pr, "Run --aftercare first");
      task = (services.aftercare ?? githubAftercare)(task, pr, args.handled, root);
    }
    if (!["decision_required", "repeated_failure", "findings", "ci_failure"].includes(args.event))
      requireClean(root);
    task = transitionTask(task, args.event, args.exit ? readJson(args.exit) : {}, root);
  }
  saveTask(task, root);
  if (args.export || args["export-file"] || args["sync-pr"]) {
    requireClean(root);
    requireValue(
      ["aftercare", "done"].includes(task.state),
      "Only reviewed tasks can be published",
    );
    const block = stateBlock(task);
    if (args.export) return block;
    if (args["export-file"]) {
      writeFileSync(args["export-file"], `${block}\n`, { mode: 0o600 });
      return { taskId: task.taskId, state: task.state, written: args["export-file"] };
    }
    const pr = JSON.parse(
      gh(["pr", "view", args["sync-pr"], "--json", "body,headRefOid,baseRefOid"], root),
    );
    requireValue(
      pr.headRefOid === task.head && pr.baseRefOid === task.baseHead,
      "PR revision differs from local task",
    );
    const body = pr.body.includes(STATE_START)
      ? pr.body.replace(
          /<!-- suzumemo-agent-state:start -->[\s\S]*?<!-- suzumemo-agent-state:end -->/,
          block,
        )
      : `${pr.body}\n\n${block}`;
    const temp = mkdtempSync(path.join(tmpdir(), "agent-state-"));
    try {
      const file = path.join(temp, "body.md");
      writeFileSync(file, body, { mode: 0o600 });
      gh(["pr", "edit", args["sync-pr"], "--body-file", file], root);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
  return task;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run(parseArguments(process.argv.slice(2)));
    console.log(
      typeof result === "string"
        ? result
        : JSON.stringify(result.version === 2 ? summarizeTask(result) : result, null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
