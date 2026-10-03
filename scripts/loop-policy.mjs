import { validateDocument } from "./loop-schema.mjs";
import { assessChange } from "./assess-change.mjs";
import { REVIEW_TIERS, validateAssessment } from "./review-depth.mjs";

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
  return evidence?.head === task.head && evidence?.baseHead === task.baseHead;
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
// Retried checks (flake rerun, ready_for_review re-trigger) leave superseded
// runs in the rollup; only the latest run per check name is authoritative.
// A pending run is superseded only by a completed run whose start is strictly
// newer — a completion time alone cannot prove the pending attempt is older,
// because the completed run may have started before it. Entries we cannot
// order (no name/context or no timestamp) and pending runs that are not
// provably superseded are always kept so a failed or pending run is never
// hidden behind an older success — fail-closed.
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
    const latest = completed.reduce(
      (best, entry) => (best && entry.at < best.at ? best : entry),
      null,
    );
    const blocking = group.filter(
      (entry) =>
        isPendingCheck(entry.check) &&
        !completed.some((other) => {
          const start = checkStartKey(other.check);
          return start && start > entry.at;
        }),
    );
    if (blocking.length > 0) selected.push(...blocking.map((entry) => entry.check));
    else if (latest) selected.push(latest.check);
  }
  return selected;
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
  const checks = selectChecks(rawChecks);
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
