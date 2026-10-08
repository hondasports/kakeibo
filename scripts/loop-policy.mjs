import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { requiredKeys, validateDocument } from "./loop-schema.mjs";
import { assessChange } from "./assess-change.mjs";
import { isContentTarget, readChangedHunks } from "./machine-risk.mjs";
import { REVIEW_AXES, REVIEW_TIERS, validateAssessment } from "./review-depth.mjs";
import { validateReproduction } from "./ci-failure.mjs";
import { ciCodeChanged } from "./ci-change-scope.mjs";
import { hasPrepushMarker } from "./verify-prepush.mjs";
import { assessmentDraftFloors } from "./loop-draft.mjs";

export const highestTier = (...tiers) =>
  REVIEW_TIERS[Math.max(...tiers.filter(Boolean).map((tier) => REVIEW_TIERS.indexOf(tier)), 0)];
export const CHECK_COMMANDS = {
  process: [
    ["node", "scripts/check-loop-docs.mjs"],
    ["pnpm", "run", "test:process"],
  ],
  lint: [
    ["pnpm", "run", "lint"],
    ["pnpm", "run", "format:check"],
  ],
  unit: [["pnpm", "exec", "vitest", "run"]],
  build: [["pnpm", "run", "build"]],
};
/**
 * Test files owned by the process suite (`test:process`). The process kind is
 * required for every change and runs them, so the local unit kind excludes
 * them instead of executing the same files twice. CI still runs everything.
 * A missing or unparsable script yields no exclusions (runs more, never less).
 */
export function processSuiteFiles(root = process.cwd()) {
  try {
    const file = path.join(root, "package.json");
    if (!existsSync(file)) return [];
    const script = JSON.parse(readFileSync(file, "utf8")).scripts?.["test:process"];
    if (typeof script !== "string") return [];
    // Linear tokenization (no backtracking regex). Only a plain list of literal
    // file paths is trusted: any option (its value could change what runs) or
    // shell/glob metacharacter (sh and vitest expand differently) disables the
    // exclusion entirely, so unit runs everything rather than too little.
    const [command, subcommand, ...files] = script.trim().split(/\s+/);
    if (command !== "vitest" || subcommand !== "run" || files.length === 0) return [];
    if (files.some((token) => token.startsWith("-") || /[*?[\]{}()'"`$\\;&|<>!~]/.test(token)))
      return [];
    return files;
  } catch {
    return [];
  }
}
/** `--exclude` arguments that keep the unit kind off the process suite's files. */
export const processSuiteExcludes = (root = process.cwd()) =>
  processSuiteFiles(root).flatMap((file) => ["--exclude", file]);
/** Full local unit command: the vitest suite minus files the process kind already runs. */
export function unitFullCommand(root = process.cwd()) {
  return [[...CHECK_COMMANDS.unit[0], ...processSuiteExcludes(root)]];
}
/** Unit evidence from `--scope affected` cannot satisfy a gate that needs the full suite. */
// Evidence recorded by the runner always carries run.scope; only legacy entries
// without a `run` record (pre-scope format) are read as full.
export const isFullScopeEvidence = (evidence) =>
  evidence?.run ? evidence.run.scope === "full" : true;
/** Where each verification kind executes and what it covers. */
export const VERIFICATION_SCOPES = {
  process: { execution: "local", scope: "harness docs integrity + process test suite" },
  lint: { execution: "local", scope: "repo lint + format" },
  unit: {
    execution: "local",
    scope:
      "vitest suite excluding test:process files; affected (vitest related) satisfies EXECUTE→REVIEW only, full is required from REVIEW clean",
  },
  build: { execution: "local", scope: "production build" },
  e2e: { execution: "github", scope: "playwright e2e (delivery gate)" },
};
export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
const text = (value) => typeof value === "string" && value.trim().length > 0;
export function validateSpec(spec, root) {
  validateDocument("spec", spec, root);
  // #954: a v2 state-block spec is a reference ({ref, fingerprint, acIds});
  // the issue's Agent Spec is canonical. It validates against the same
  // invariants — no open decisions, unique AC ids — on its own fields.
  if (typeof spec.ref === "string") {
    requireValue(spec.openDecisions === 0, "Spec has open material decisions");
    const ids = spec.acIds;
    requireValue(
      ids.every(text) && new Set(ids).size === ids.length,
      "Acceptance criteria need unique IDs",
    );
    return;
  }
  requireValue(spec.openMaterialDecisions.length === 0, "Spec has open material decisions");
  const ids = spec.acceptanceCriteria.map((ac) => ac.id);
  requireValue(
    ids.every(text) && new Set(ids).size === ids.length,
    "Acceptance criteria need unique IDs",
  );
}
export function validateTask(task, root) {
  validateDocument("state", task, root);
  validateDocument("spec", task.spec, root);
  if (task.assessment) validateDocument("assessment", task.assessment, root);
  requireValue(REVIEW_TIERS.includes(task.risk), "Invalid retained risk");
  requireValue(text(task.configuration?.runtime?.name), "Runtime must be loaded at startup");
}
export function currentEvidence(evidence, task) {
  // New-style verification evidence carries `appliesTo`; legacy entries and
  // review/aftercare records keep `head`/`baseHead` at the top level.
  const appliesTo = evidence?.appliesTo ?? evidence;
  return appliesTo?.head === task.head && appliesTo?.baseHead === task.baseHead;
}
/**
 * #949: CI checks that decide AFTERCARE readiness, with their acceptance
 * semantics. Lint/Build/Test are always required — on .md-only diffs the CI
 * scope job skips them, so SKIPPED counts only when the harness itself
 * confirms (via ciCodeChanged, shared with the CI job) that no code changed.
 * Anything else (unobserved, pending, failure) never counts.
 */
export function expectedCiChecks(paths, assessment) {
  const mdOnly = !ciCodeChanged(paths);
  const checks = [
    { name: "Agent harness", accept: ["SUCCESS"], reason: "delivery gate" },
    { name: "CI scope", accept: ["SUCCESS"], reason: "diff classification" },
  ];
  for (const name of ["Lint", "Build", "Test"])
    checks.push(
      mdOnly
        ? { name, accept: ["SUCCESS", "SKIPPED"], reason: "md-only change: SKIPPED accepted" }
        : { name, accept: ["SUCCESS"], reason: "required for code changes" },
    );
  if (assessment?.verification?.e2e)
    checks.push(
      { name: "E2E (Playwright / Chromium / public)", accept: ["SUCCESS"], reason: "e2e required" },
      {
        name: "E2E (Playwright / Chromium / authenticated)",
        accept: ["SUCCESS"],
        reason: "e2e required",
      },
    );
  return checks;
}
/**
 * #952: REVIEW clean時に要求するCI check。`Agent harness` はdraft中skipされ、
 * ready化後に本実行されるため、clean判定ではなくAFTERCAREで要求する。
 */
export function expectedReviewCiChecks(paths, assessment) {
  return expectedCiChecks(paths, assessment).filter((check) => check.name !== "Agent harness");
}
/**
 * #952: T2/T3のREVIEW cleanは現在HEADのCI checkを正本とする
 * （ローカルfull unit証跡の代わり）。全Tier同じ扱い（#952/#953）。
 * ローカルprocess証跡だけでcleanし、CI待ちはAFTERCAREに残す。
 */
export const requiresReviewCi = (task) => task.risk !== "T1";
/** Recorded CI review evidence must cover the task's current head/base. */
export function requireReviewCiEvidence(task) {
  requireValue(
    task.reviewCi?.ok === true &&
      task.reviewCi.head === task.head &&
      task.reviewCi.baseHead === task.baseHead,
    "Current CI review evidence is required (evaluate the PR checks on this HEAD)",
  );
}
/**
 * #952: evaluate the PR's statusCheckRollup against expectedReviewCiChecks.
 * verdict: ok | pending | failure | unexpected_skip | head_mismatch.
 * `unexpected_skip` covers SKIPPED where the accept list excludes it — a
 * `.md`以外を含む変更での Lint/Build/Test のSKIPPEDはCI条件の誤りを疑うため
 * 不合格として別扱いにする。`head_mismatch` は別HEADのcheck（AC3）を数えない。
 */
export function evaluateReviewCi(prFields, task, paths = []) {
  const required = expectedReviewCiChecks(paths, task.assessment);
  if (!prFields || prFields.headRefOid !== task.head || prFields.baseRefOid !== task.baseHead)
    return { verdict: "head_mismatch", required, observed: [] };
  const checks = selectChecks(prFields.statusCheckRollup ?? []);
  const observed = required.map((expected) => {
    const check = checks.find((entry) => (entry.name ?? entry.context) === expected.name);
    let state = "unobserved";
    if (check) {
      const conclusion = check.conclusion ?? check.state;
      if (isPendingCheck(check)) state = "pending";
      else if (expected.accept.includes(conclusion)) state = "accepted";
      else if (conclusion === "SKIPPED") state = "unexpected_skip";
      else state = "failure";
    }
    return {
      ...expected,
      state,
      conclusion: check?.conclusion ?? check?.state ?? null,
      detailsUrl: check?.detailsUrl ?? check?.details_url ?? null,
      runUrl: check?.runUrl ?? check?.run_url ?? null,
    };
  });
  const failed = observed.filter((c) => c.state === "failure").map((c) => c.name);
  const skipped = observed.filter((c) => c.state === "unexpected_skip").map((c) => c.name);
  const pending = observed
    .filter((c) => c.state === "pending" || c.state === "unobserved")
    .map((c) => c.name);
  const verdict = failed.length
    ? "failure"
    : skipped.length
      ? "unexpected_skip"
      : pending.length
        ? "pending"
        : "ok";
  return { verdict, required, observed, failed, skipped, pending };
}
/** Verification kinds required locally for this task (e2e is a GitHub delivery gate). */
export function requiredVerificationKinds(task) {
  const kinds = Object.entries(task.assessment?.verification ?? {})
    .filter(([kind, required]) => required && kind !== "e2e")
    .map(([kind]) => kind);
  // Only the process gate is verified locally; CI is the verdict for the rest.
  return kinds.filter((kind) => kind === "process");
}
export function verificationSummary(task) {
  const summary = {};
  // Kinds deferred to CI display as "ci" (like e2e's "github") instead of a
  // misleading "missing".
  const locallyRequired = new Set(requiredVerificationKinds(task));
  for (const [kind, required] of Object.entries(task.assessment?.verification ?? {})) {
    if (!required) continue;
    if (kind === "e2e") {
      summary[kind] = "github";
      continue;
    }
    const result = task.verification?.[kind];
    if (!result && !locallyRequired.has(kind)) {
      summary[kind] = "ci";
      continue;
    }
    summary[kind] = !result
      ? "missing"
      : !currentEvidence(result, task)
        ? "stale"
        : result.success !== true
          ? "failed"
          : ["pass", ...(isFullScopeEvidence(result) ? [] : ["affected"])]
              .join(",")
              .replace(/^pass,(.+)$/, "pass($1)");
  }
  return summary;
}
export function aftercareSummary(task) {
  const evidence = task.aftercare;
  if (!evidence) return null;
  return {
    ready: currentEvidence(evidence, task) && evidence.ready === true,
    pr: evidence.pr ?? null,
    checkedAt: evidence.checkedAt ?? null,
  };
}
/** Unmet machine-floor requirements toward the next transition, as short tokens. */
export function missingRequirements(task, root) {
  const missing = [];
  // EXECUTE→REVIEW accepts affected-scope unit evidence; every later gate needs the full suite.
  const localVerificationMissing = ({ fullUnit = true } = {}) => {
    if (!task.assessment || !task.agentAssessment) missing.push("assessment");
    else if (validateAssessment(task.agentAssessment).length > 0)
      missing.push("assessment(invalid)");
    for (const skill of task.assessment?.requiredSkills ?? [])
      if (!task.skills.includes(skill)) missing.push(`skill:${skill}`);
    for (const kind of requiredVerificationKinds(task)) {
      const result = task.verification?.[kind];
      if (!(currentEvidence(result, task) && result.success === true))
        missing.push(`verify:${kind}`);
      else if (kind === "unit" && fullUnit && !isFullScopeEvidence(result))
        missing.push("verify:unit(full)");
    }
  };
  const reviewMissing = () => {
    if (!currentEvidence(task.review, task)) missing.push("review");
    for (const finding of task.findings ?? [])
      if (finding.status === "open") missing.push(`finding:${finding.id}`);
    if (task.assessment?.review?.independent && task.review && task.review.independent !== true)
      missing.push("independent-review");
  };
  if (task.state === "refine") {
    if (!task.agentAssessment) missing.push("assessment");
    else if (validateAssessment(task.agentAssessment).length > 0)
      missing.push("assessment(invalid)");
    if ((task.spec?.openMaterialDecisions ?? []).length > 0) missing.push("openMaterialDecisions");
    const ids = (task.spec?.acceptanceCriteria ?? []).map((ac) => ac.id);
    if (!ids.length || !ids.every(text) || new Set(ids).size !== ids.length)
      missing.push("spec:acceptanceCriteria");
  }
  if (task.state === "execute") {
    localVerificationMissing({ fullUnit: false });
    // Every tier must have run verify:prepush on this HEAD before EXECUTE→REVIEW.
    if (root && task.agentAssessment && !prepushMarkerPresent(task, root))
      missing.push("verify:prepush");
  }
  if (task.state === "review") {
    localVerificationMissing();
    reviewMissing();
  }
  if (task.state === "aftercare") {
    localVerificationMissing();
    reviewMissing();
    if (!(currentEvidence(task.aftercare, task) && task.aftercare.ready === true))
      missing.push("aftercare");
  }
  return missing;
}
export function computeAssessment(task, paths, root = process.cwd()) {
  const reviewAssessment = currentEvidence(task.review, task) ? task.review.assessment : null;
  // Content rules only inspect convex/src TypeScript; other paths cannot hide
  // dangerous symbols, so their hunks are not needed. When a diff IS needed
  // but unreadable, the floor fails closed (T3).
  let hunks = {};
  let diffFailed = false;
  if (paths.some(isContentTarget)) {
    try {
      hunks = readChangedHunks({ base: task.baseRef ?? "origin/preview", cwd: root, paths });
    } catch {
      diffFailed = true;
    }
  }
  const result = assessChange({
    paths,
    hunks,
    diffFailed,
    predictedRisk: highestTier(task.spec.predictedRisk, task.risk),
    agentAssessment: task.agentAssessment,
    reviewerAssessment: reviewAssessment,
  });
  result.verificationPlan = verificationPlan(result, task, root);
  return result;
}
/**
 * Per-kind execution plan recorded on the assessment: where each check runs,
 * what it covers, why it is required, and where its evidence lands.
 */
function verificationPlan(result, task, root) {
  const acs = (
    task.spec?.acceptanceCriteria ??
    task.spec?.acIds?.map((id) => ({ id })) ??
    []
  )
    .map((ac) => ac.id)
    .filter(Boolean);
  return Object.entries(result.verification).map(([kind, required]) => {
    const meta = VERIFICATION_SCOPES[kind] ?? { execution: "local", scope: "unknown" };
    const reason =
      kind === "process"
        ? "required for every change"
        : !required
          ? "not required"
          : result.runtimeRelevant
            ? "runtime-relevant paths changed"
            : // a required non-process kind with no runtime relevance is only
              // reachable via thorough (required === runtimeRelevant || thorough)
              "tier/uncertainty requires thorough verification";
    return {
      kind,
      required,
      execution: meta.execution,
      scope: meta.scope,
      reason,
      evidence: `verification.${kind}`,
      commands: kind === "unit" ? unitFullCommand(root) : (CHECK_COMMANDS[kind] ?? null),
      acs,
    };
  });
}
export function requireLocalVerification(task, { fullUnit = true } = {}) {
  requireValue(task.assessment && task.agentAssessment, "Current change assessment is required");
  requireValue(validateAssessment(task.agentAssessment).length === 0, "Invalid agent assessment");
  for (const skill of task.assessment.requiredSkills)
    requireValue(task.skills.includes(skill), `Required skill not acknowledged: ${skill}`);
  // Locally required kinds collapse to `process` alone via requiredVerificationKinds.
  for (const kind of requiredVerificationKinds(task)) {
    const result = task.verification[kind];
    requireValue(
      currentEvidence(result, task) && result.success === true,
      `Missing current successful verification: ${kind}`,
    );
    if (kind === "unit" && fullUnit)
      requireValue(
        isFullScopeEvidence(result),
        "Full unit verification is required at this gate (affected scope only satisfies EXECUTE→REVIEW)",
      );
  }
}
/**
 * verify:prepush recorded a success marker on this HEAD.
 * Delegates to the same lookup the writer uses (absolute --git-path plus a
 * sanitized environment) so a GIT_*-polluted hook context cannot make the
 * reader and the writer disagree about where the marker lives.
 */
export function prepushMarkerPresent(task, root) {
  try {
    return hasPrepushMarker(root, task.head);
  } catch {
    return false;
  }
}
/**
 * Finding severities. clean only requires every blocker/major finding to be
 * fixed or dismissed with grounds; minor/nit may instead be recorded as
 * `deferred` with a follow-up issue URL. A finding without severity counts
 * as major, so it can never be deferred.
 */
export const FINDING_SEVERITIES = ["blocker", "major", "minor", "nit"];
export const DEFERRABLE_SEVERITIES = ["minor", "nit"];
export const FINDING_FOLLOWUP_PATTERN = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+$/;
export function validateFinding(finding, ids = new Set()) {
  requireValue(
    text(finding.id) &&
      !ids.has(finding.id) &&
      ["open", "fixed", "dismissed", "deferred"].includes(finding.status) &&
      text(finding.evidence),
    "Invalid finding record (unique id, status open|fixed|dismissed|deferred, non-empty evidence required)",
  );
  requireValue(
    finding.severity === undefined || FINDING_SEVERITIES.includes(finding.severity),
    `Invalid finding severity: ${finding.severity} (${FINDING_SEVERITIES.join("|")})`,
  );
  if (finding.status === "deferred") {
    requireValue(
      DEFERRABLE_SEVERITIES.includes(finding.severity),
      "Only minor/nit findings can be deferred (missing severity counts as major)",
    );
    requireValue(
      FINDING_FOLLOWUP_PATTERN.test(finding.followUp ?? ""),
      "A deferred finding needs a followUp issue URL (https://github.com/<owner>/<repo>/issues/<n>)",
    );
  }
}
export function validateReview(task, report) {
  requireValue(currentEvidence(report, task), "Review must match current HEAD and base");
  requireValue(
    text(report.reviewer) &&
      Array.isArray(report.evidence) &&
      report.evidence.length > 0 &&
      report.evidence.every(text),
    "Review needs reviewer and evidence",
  );
  requireValue(Array.isArray(report.findings), "Review findings are required");
  const ids = new Set();
  for (const finding of report.findings) {
    validateFinding(finding, ids);
    ids.add(finding.id);
  }
  for (const previous of task.findings ?? []) {
    requireValue(
      report.findings.some((finding) => finding.id === previous.id),
      `Review must account for prior finding: ${previous.id}`,
    );
  }
  requireValue(Array.isArray(report.acceptanceCriteria), "Review must cover acceptance criteria");
  // A v2 reference spec carries the AC ids it was reviewed against (acIds).
  for (const ac of task.spec.acceptanceCriteria ?? task.spec.acIds?.map((id) => ({ id })) ?? []) {
    requireValue(
      report.acceptanceCriteria.some((entry) => entry.id === ac.id && text(entry.evidence)),
      `Missing AC evidence: ${ac.id}`,
    );
  }
  const assessmentErrors = validateAssessment(report.assessment);
  requireValue(
    assessmentErrors.length === 0,
    `Reviewer assessment invalid (must satisfy the machine floor): ${assessmentErrors.join("; ")}`,
  );
  if (report.deltaFrom !== undefined) {
    requireValue(
      typeof report.deltaFrom === "string" && /^[0-9a-f]{40}$/i.test(report.deltaFrom),
      "deltaFrom must be a 40-character commit SHA",
    );
    const reviewedHeads = new Set(
      (task.history ?? [])
        .filter((entry) => entry.event === "review_recorded" && entry.head)
        .map((entry) => entry.head),
    );
    requireValue(
      report.deltaFrom !== task.head && reviewedHeads.has(report.deltaFrom),
      "deltaFrom must reference a previously reviewed head",
    );
  }
  if (report.independent === true) {
    requireValue(
      report.reviewer !== task.implementer && report.context === "fresh",
      "Independent review needs a different reviewer and fresh context",
    );
  }
}
export function validateTransition({ task, event, exit = {}, limits, root }) {
  validateTask(task, root);
  validateDocument("exit", { state: task.state, event, ...exit }, root);
  requireValue(
    (!exit.state || exit.state === task.state) && (!exit.event || exit.event === event),
    "Exit does not match transition",
  );
  requireValue(!exit.blockers?.length, "Resolve blockers before transitioning");
  if (task.state === "refine" && event === "ready") {
    validateSpec(task.spec, root);
    // The recorded assessment feeds thorough verification derivation; leaving
    // REFINE without it stays blocked (as with the removed profile decision).
    requireValue(task.agentAssessment, "Assessment is required to leave REFINE");
    // Presence alone is not enough: an invalid assessment (hand-edited state or
    // crafted state block) must fail at this gate, not one gate later.
    requireValue(validateAssessment(task.agentAssessment).length === 0, "Invalid agent assessment");
  }
  if (task.state === "execute" && event === "ready")
    requireLocalVerification(task, { fullUnit: false });
  if (task.state === "review" && event === "clean") {
    requireLocalVerification(task);
    validateReview(task, task.review);
    requireValue(
      task.review.findings.every((finding) => finding.status !== "open"),
      "Open review findings remain",
    );
    requireValue(
      !task.assessment.review.independent || task.review.independent === true,
      "Independent review is required",
    );
    // #952: T2/T3のcleanは現在HEADのCI結果を正本とする。runnerが評価して
    // 記録した証跡を要求する（この関数自身はCIを取得しない）。
    if (requiresReviewCi(task)) requireReviewCiEvidence(task);
  }
  if (task.state === "aftercare" && event === "ready") {
    requireLocalVerification(task);
    validateReview(task, task.review);
    requireValue(
      task.review.findings.every((finding) => finding.status !== "open"),
      "Open review findings remain",
    );
    requireValue(
      !task.assessment.review.independent || task.review.independent === true,
      "Independent review is required",
    );
    requireValue(
      currentEvidence(task.aftercare, task) && task.aftercare.ready === true,
      "Current GitHub aftercare evidence is required",
    );
  }
  // #948: the conditional exit keys a submission must carry are defined once,
  // in requiredKeys() — --draft exit emits exactly this set, and the presence
  // checks below key off the same list instead of restating the conditions.
  const requiredExitKeys = requiredKeys(
    "exit",
    {
      event,
      state: task.state,
      counters: task.counters,
      limits,
    },
    root,
  );
  if (["decision_required", "repeated_failure"].includes(event))
    requireValue(text(exit.reason), "Stop reason is required");
  if (requiredExitKeys.includes("approval"))
    requireValue(
      exit.approval?.source === "user" && text(exit.approval.reference),
      "Explicit user approval reference is required",
    );
  if (requiredExitKeys.includes("resolution"))
    requireValue(text(exit.resolution), "Incident resolution evidence is required");
  if (event === "findings") {
    requireValue(text(exit.reason), "Finding evidence is required");
    requireValue(
      task.counters.review < limits.review_max_rounds,
      "Review limit reached; enter incident",
    );
    if (requiredExitKeys.includes("reassessment"))
      requireValue(text(exit.reassessment), "Review strategy reassessment is required");
  }
  if (event === "ci_failure") {
    requireValue(text(exit.reason), "CI failure evidence is required");
    // #958: 再現確認は遷移exitの必須証跡。command/result(reproduced|not_reproduced)/note
    requireValue(
      validateReproduction(exit.reproduction).length === 0,
      "ci_failure exit requires reproduction {command,result:reproduced|not_reproduced,note}",
    );
    // 失敗checkの機械抽出レコード（--ci-failures で生成）。
    // 複数check同時失敗は配列で1遷移にまとめて記録する（counters.ciの浪費防止）。
    {
      const records = Array.isArray(exit.ciFailure) ? exit.ciFailure : [exit.ciFailure];
      requireValue(
        records.length > 0 &&
          records.every((r) => typeof r === "object" && r != null && text(r.check)),
        "ci_failure exit requires ciFailure record(s) (run --ci-failures <pr>)",
      );
    }
    requireValue(
      task.counters.ci < limits.ci_fix_max_rounds,
      "CI repair limit reached; enter incident",
    );
  }
  if (task.state === "execute" && event === "ready") {
    requireValue(
      !(task.ciFailures ?? []).some((f) => !f.resolvedAt),
      "Unresolved ciFailure records remain; run --resolve-ci-failures first",
    );
    // No task may merge without having run the same commands CI runs — the
    // pre-push marker is the (unrecorded) proof it happened.
    // Checked last so more specific gates report first.
    requireValue(
      prepushMarkerPresent(task, root),
      "verify:prepush success marker missing for current HEAD (run pnpm verify:prepush)",
    );
  }
}
/**
 * #948: a submitted assessment may only raise the machine-derived draft
 * values (data_security, reversibility, applied_tier), never lower them.
 * Axes without a trigger carry no floor (the agent judges freely).
 */
export function requireAssessmentAboveFloor(
  assessment,
  { floorTriggers = [], minimumTier = "T1" } = {},
) {
  const floors = assessmentDraftFloors(floorTriggers);
  for (const [axis, floor] of Object.entries(floors)) {
    if (!floor) continue;
    const allowed = REVIEW_AXES[axis];
    requireValue(
      allowed.indexOf(assessment?.risk_assessment?.[axis]) >= allowed.indexOf(floor),
      `assessment ${axis} must not be below the machine floor (${floor})`,
    );
  }
  requireValue(
    assessment?.applied_tier === undefined ||
      REVIEW_TIERS.indexOf(assessment.applied_tier) >= REVIEW_TIERS.indexOf(minimumTier),
    `assessment applied_tier must not be below the machine floor (${minimumTier})`,
  );
}
/** Start-time key: when the run began, not when it finished. */
const checkStartKey = (check) =>
  check.startedAt ?? check.started_at ?? check.createdAt ?? check.created_at ?? "";
/** Ordering key for a check entry: run start preferred, completion as fallback. */
export function checkRecencyKey(check) {
  return checkStartKey(check) || (check.completedAt ?? check.completed_at ?? "");
}
export function isPendingCheck(check) {
  if (check.status) return check.status !== "COMPLETED";
  return ["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"].includes(
    check.state,
  );
}
const isSuccessfulCheck = (check) =>
  (!check.status || check.status === "COMPLETED") &&
  ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion ?? check.state);
// Retried checks (flake rerun, ready_for_review re-trigger) leave superseded
// runs in the rollup; only the latest run per check name is authoritative.
// A pending run is superseded only by a completed run whose start is strictly
// newer — a completion time alone cannot prove the pending attempt is older,
// because the completed run may have started before it. Among completed runs,
// start-keyed entries order by their start; completion-only entries cannot be
// compared against start times, so they stay evaluated (fail-closed) unless
// every completed run lacks a start time, where completion time is the only
// ordering signal. Entries we cannot order (no name/context or no timestamp)
// are always kept so a failed or pending run is never hidden behind an older
// success — fail-closed.
export function selectChecks(rawChecks) {
  const groups = new Map();
  const selected = [];
  for (const check of rawChecks) {
    const name = check.name ?? check.context;
    const at = checkRecencyKey(check);
    if (!name || !at) {
      selected.push(check);
      continue;
    }
    const group = groups.get(name) ?? [];
    group.push({ check, at });
    groups.set(name, group);
  }
  for (const group of groups.values()) {
    const completed = group.filter((entry) => !isPendingCheck(entry.check));
    const startKeyed = completed.filter((entry) => checkStartKey(entry.check));
    const orderable = startKeyed.length > 0 ? startKeyed : completed;
    const latest = orderable.reduce((best, entry) => {
      if (!best) return entry;
      if (entry.at > best.at) return entry;
      if (entry.at === best.at && !isSuccessfulCheck(entry.check) && isSuccessfulCheck(best.check))
        return entry;
      return best;
    }, null);
    if (startKeyed.length > 0)
      selected.push(
        ...completed.filter((entry) => !checkStartKey(entry.check)).map((entry) => entry.check),
      );
    const blocking = group.filter(
      (entry) =>
        isPendingCheck(entry.check) &&
        !completed.some((other) => {
          const start = checkStartKey(other.check);
          return start && start > entry.at;
        }),
    );
    selected.push(...blocking.map((entry) => entry.check));
    if (latest) selected.push(latest.check);
  }
  return selected;
}
export function checkAftercare(pr, task, findings, paths = []) {
  requireValue(
    pr.headRefOid === task.head && pr.baseRefOid === task.baseHead,
    "PR HEAD/base changed",
  );
  requireValue(
    pr.state === "OPEN" &&
      !pr.isDraft &&
      pr.mergeable === "MERGEABLE" &&
      pr.mergeStateStatus === "CLEAN",
    "PR is not merge ready",
  );
  requireValue(
    !["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(pr.reviewDecision),
    "PR approval is outstanding",
  );
  const rawChecks = pr.statusCheckRollup ?? [];
  requireValue(rawChecks.length > 0, "No CI checks observed");
  const checks = selectChecks(rawChecks);
  for (const check of checks)
    requireValue(
      isSuccessfulCheck(check),
      `Unsuccessful or pending check: ${check.name ?? check.context}`,
    );
  // #949: required checks and their acceptance come from expectedCiChecks —
  // SKIPPED only counts where the harness itself confirms the diff is .md
  // only. Unobserved/pending/failure never counts for any required check.
  for (const { name, accept } of expectedCiChecks(paths, task.assessment))
    requireValue(
      checks.some(
        (check) =>
          (check.name ?? check.context) === name &&
          accept.includes(check.conclusion ?? check.state),
      ),
      `Required check not observed successful: ${name}`,
    );
  requireValue(
    findings.pagesComplete === true &&
      findings.unhandledCount === 0 &&
      findings.unresolvedThreadCount === 0,
    "Unhandled or incompletely collected PR findings remain",
  );
  return {
    head: task.head,
    baseHead: task.baseHead,
    ready: true,
    pr: pr.number,
    checkedAt: new Date().toISOString(),
  };
}

/** Shared reviewed-source gate for PR CI and read-only delivery checks. */
export function validateCheckpoint(task, { head, baseHead, paths, root = process.cwd() }) {
  validateTask(task, root);
  validateSpec(task.spec, root);
  requireValue(
    task.head === head && task.baseHead === baseHead,
    "Agent state does not match PR HEAD/base",
  );
  requireValue(["aftercare", "done"].includes(task.state), "Agent task has not completed review");
  const assessment = computeAssessment(task, paths, root);
  requireValue(
    task.risk === highestTier(task.risk, assessment.risk.final),
    "Retained risk is below the current floor",
  );
  const current = { ...task, assessment };
  requireLocalVerification(current);
  validateReview(current, current.review);
  requireValue(
    current.review.findings.every((finding) => finding.status !== "open"),
    "Open review findings remain",
  );
  requireValue(
    !assessment.review.independent || current.review.independent === true,
    "Independent reviewer evidence is required",
  );
  // #952: the state block must also carry the recorded CI review evidence for
  // T2/T3 — the same contract the REVIEW clean gate enforces.
  if (requiresReviewCi(current)) requireReviewCiEvidence(current);
  return assessment;
}
