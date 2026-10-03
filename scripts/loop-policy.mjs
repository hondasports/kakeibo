import { validateDocument } from "./loop-schema.mjs";
import { assessChange } from "./assess-change.mjs";
import { REVIEW_TIERS, validateAssessment } from "./review-depth.mjs";
import { profileInputs, missingProfileInputs } from "./resolve-agent-profile.mjs";

export const highestTier = (...tiers) =>
  REVIEW_TIERS[Math.max(...tiers.filter(Boolean).map((tier) => REVIEW_TIERS.indexOf(tier)), 0)];
export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
const text = (value) => typeof value === "string" && value.trim().length > 0;
export function validateSpec(spec, root) {
  validateDocument("spec", spec, root);
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
  requireValue(
    text(task.configuration?.profileSource) && text(task.configuration?.runtime?.name),
    "Profile/runtime must be loaded at startup",
  );
}
export function currentEvidence(evidence, task) {
  // New-style verification evidence carries `appliesTo`; legacy entries and
  // review/aftercare records keep `head`/`baseHead` at the top level.
  const appliesTo = evidence?.appliesTo ?? evidence;
  return appliesTo?.head === task.head && appliesTo?.baseHead === task.baseHead;
}
/** Verification kinds required locally for this task (e2e is a GitHub delivery gate). */
export function requiredVerificationKinds(task) {
  return Object.entries(task.assessment?.verification ?? {})
    .filter(([kind, required]) => required && kind !== "e2e")
    .map(([kind]) => kind);
}
export function verificationSummary(task) {
  const summary = {};
  for (const [kind, required] of Object.entries(task.assessment?.verification ?? {})) {
    if (!required) continue;
    if (kind === "e2e") {
      summary[kind] = "github";
      continue;
    }
    const result = task.verification?.[kind];
    summary[kind] = !result
      ? "missing"
      : !currentEvidence(result, task)
        ? "stale"
        : result.success === true
          ? "pass"
          : "failed";
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
export function missingRequirements(task) {
  const missing = [];
  const localVerificationMissing = () => {
    if (!task.assessment || !task.agentAssessment) missing.push("assessment");
    for (const skill of task.assessment?.requiredSkills ?? [])
      if (!task.skills.includes(skill)) missing.push(`skill:${skill}`);
    for (const kind of requiredVerificationKinds(task)) {
      const result = task.verification?.[kind];
      if (!(currentEvidence(result, task) && result.success === true))
        missing.push(`verify:${kind}`);
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
    else
      for (const field of missingProfileInputs(
        profileInputs(task.agentAssessment, {
          fallbackLoad: task.configuration?.selection?.inputs?.verification_load,
        }),
      ))
        missing.push(`profile:${field}`);
    if ((task.spec?.openMaterialDecisions ?? []).length > 0) missing.push("openMaterialDecisions");
    const ids = (task.spec?.acceptanceCriteria ?? []).map((ac) => ac.id);
    if (!ids.length || !ids.every(text) || new Set(ids).size !== ids.length)
      missing.push("spec:acceptanceCriteria");
  }
  if (task.state === "execute") localVerificationMissing();
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
export function computeAssessment(task, paths) {
  const reviewAssessment = currentEvidence(task.review, task) ? task.review.assessment : null;
  const result = assessChange({
    paths,
    predictedRisk: highestTier(task.spec.predictedRisk, task.risk),
    agentAssessment: task.agentAssessment,
    reviewerAssessment: reviewAssessment,
  });
  if (task.configuration?.profile?.verification === "thorough") {
    Object.assign(result.verification, { lint: true, unit: true, build: true });
  }
  return result;
}
export function requireLocalVerification(task) {
  requireValue(task.assessment && task.agentAssessment, "Current change assessment is required");
  requireValue(validateAssessment(task.agentAssessment).length === 0, "Invalid agent assessment");
  for (const skill of task.assessment.requiredSkills)
    requireValue(task.skills.includes(skill), `Required skill not acknowledged: ${skill}`);
  for (const [kind, required] of Object.entries(task.assessment.verification)) {
    // Browser E2E is a delivery gate, checked against GitHub in AFTERCARE.
    if (!required || kind === "e2e") continue;
    const result = task.verification[kind];
    requireValue(
      currentEvidence(result, task) && result.success === true,
      `Missing current successful verification: ${kind}`,
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
    requireValue(
      text(finding.id) &&
        !ids.has(finding.id) &&
        ["open", "fixed", "dismissed"].includes(finding.status) &&
        text(finding.evidence),
      "Invalid finding record",
    );
    ids.add(finding.id);
  }
  for (const previous of task.findings ?? []) {
    requireValue(
      report.findings.some((finding) => finding.id === previous.id),
      `Review must account for prior finding: ${previous.id}`,
    );
  }
  requireValue(Array.isArray(report.acceptanceCriteria), "Review must cover acceptance criteria");
  for (const ac of task.spec.acceptanceCriteria) {
    requireValue(
      report.acceptanceCriteria.some((entry) => entry.id === ac.id && text(entry.evidence)),
      `Missing AC evidence: ${ac.id}`,
    );
  }
  requireValue(
    validateAssessment(report.assessment).length === 0,
    "Reviewer assessment is required",
  );
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
  if (task.state === "refine" && event === "ready") validateSpec(task.spec, root);
  if (task.state === "execute" && event === "ready") requireLocalVerification(task);
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
  if (["decision_required", "repeated_failure"].includes(event))
    requireValue(text(exit.reason), "Stop reason is required");
  if (event === "resolved" && task.state === "human_gate") {
    requireValue(
      exit.approval?.source === "user" && text(exit.approval.reference),
      "Explicit user approval reference is required",
    );
  }
  if (event === "resolved" && task.state === "incident")
    requireValue(text(exit.resolution), "Incident resolution evidence is required");
  if (event === "findings") {
    requireValue(text(exit.reason), "Finding evidence is required");
    requireValue(
      task.counters.review < limits.review_max_rounds,
      "Review limit reached; enter incident",
    );
    if ((task.counters.review + 1) % limits.review_reassess_every === 0)
      requireValue(text(exit.reassessment), "Review strategy reassessment is required");
  }
  if (event === "ci_failure") {
    requireValue(text(exit.reason), "CI failure evidence is required");
    requireValue(
      task.counters.ci < limits.ci_fix_max_rounds,
      "CI repair limit reached; enter incident",
    );
  }
}
export function checkAftercare(pr, task, findings) {
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
  // Retried checks (flake rerun, ready_for_review re-trigger) leave superseded
  // runs in the rollup; only the latest dated run per check name is authoritative.
  // Entries we cannot order (no name/context or no timestamp) are always kept so a
  // failed or pending run is never hidden behind an older success — fail-closed.
  const latestByName = new Map();
  const unorderable = [];
  for (const check of rawChecks) {
    const key = check.name ?? check.context;
    const at =
      check.completedAt ??
      check.completed_at ??
      check.createdAt ??
      check.created_at ??
      check.startedAt ??
      "";
    if (!key || !at) {
      unorderable.push(check);
      continue;
    }
    const prev = latestByName.get(key);
    if (!prev || at >= prev.at) latestByName.set(key, { check, at });
  }
  const checks = [...latestByName.values()].map((entry) => entry.check).concat(unorderable);
  for (const check of checks) {
    const status = check.conclusion ?? check.state;
    requireValue(
      (!check.status || check.status === "COMPLETED") &&
        ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(status),
      `Unsuccessful or pending check: ${check.name ?? check.context}`,
    );
  }
  const expected = ["Agent harness"];
  const names = { lint: "Lint", build: "Build", unit: "Test" };
  for (const [kind, name] of Object.entries(names))
    if (task.assessment.runtimeRelevant && task.assessment.verification[kind]) expected.push(name);
  if (task.assessment.verification.e2e)
    expected.push(
      "E2E (Playwright / Chromium / public)",
      "E2E (Playwright / Chromium / authenticated)",
    );
  for (const name of expected)
    requireValue(
      checks.some(
        (check) =>
          (check.name ?? check.context) === name && (check.conclusion ?? check.state) === "SUCCESS",
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
