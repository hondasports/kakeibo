import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Hash bytes or text without exposing source content in evidence identifiers. */
const hash = (value) => createHash("sha256").update(value).digest("hex");
/** Read a local JSON input; malformed data aborts the command. */
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
/** Require meaningful text for contract fields and manual evidence. */
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
/** Run Git without a shell, preserving NUL-delimited filename output. */
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`);
  return args.includes("-z") ? r.stdout : r.stdout.trim();
}
/** Identify current tracked and nonignored content; reject tracked task state and unsupported submodules. */
export function fingerprint(cwd) {
  const tracked = git(cwd, ["ls-files", "-z", "--cached"]).split("\0");
  if (tracked.some((file) => file.startsWith(".loop/state/")))
    throw new Error("task state must remain ignored and untracked");
  const files = git(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
  const records = [...new Set(files)].sort().map((file) => {
    const absolute = path.join(cwd, file);
    if (!existsSync(absolute)) return [file, "deleted"];
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) throw new Error("Submodules require a separate fingerprint adapter");
    return [
      file,
      stat.mode,
      hash(stat.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute)),
    ];
  });
  return hash(JSON.stringify(records));
}
/** Return contract shape and proof-reference errors without mutating the supplied contract. */
export function validateContract(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["contract is required"];
  for (const key of ["goal", "source", "environment"])
    if (!nonempty(c[key])) errors.push(`${key} is required`);
  if (!["local_verified", "pr_created", "merge_ready"].includes(c.delivery_target))
    errors.push("invalid delivery_target");
  for (const key of [
    "in_scope",
    "out_of_scope",
    "unresolved",
    "acceptance",
    "preserve",
    "checks",
    "controls",
  ]) {
    if (!Array.isArray(c[key])) errors.push(`${key} must be an array`);
  }
  if (errors.length) return errors;
  if (!c.in_scope.length || !c.in_scope.every(nonempty))
    errors.push("in_scope requires text entries");
  if (!c.out_of_scope.every(nonempty) || !c.unresolved.every(nonempty))
    errors.push("scope/unresolved entries must be text");
  if (!c.acceptance.length) errors.push("acceptance cannot be empty");
  const checks = new Set();
  for (const check of c.checks) {
    if (!check || !nonempty(check.id) || checks.has(check.id) || !nonempty(check.purpose))
      errors.push("invalid/duplicate check");
    checks.add(check?.id);
    if (!Array.isArray(check?.argv) || !check.argv.length || !check.argv.every(nonempty))
      errors.push("check argv must be non-empty strings");
    if (!Number.isInteger(check?.timeout_ms) || check.timeout_ms < 1 || check.timeout_ms > 3600000)
      errors.push("check timeout_ms must be 1..3600000");
  }
  const ids = new Set();
  for (const item of [...c.acceptance, ...c.preserve, ...c.controls]) {
    if (!item || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.expectation))
      errors.push("invalid/duplicate requirement or control");
    ids.add(item?.id);
    const proofs = item?.checks === undefined ? [] : item.checks;
    if (!Array.isArray(proofs)) errors.push("requirement checks must be an array");
    else if (proofs.some((id) => !checks.has(id))) errors.push("unknown verification check");
    if (Array.isArray(proofs) && !proofs.length && !nonempty(item?.manual))
      errors.push("requirement needs checks or an explicit manual verification method");
  }
  return errors;
}
/** Review-depth vocabulary mirrored from .loop/process.yaml review_depth; drift is caught by task-loop tests. */
export const REVIEW_AXES = {
  blast_radius: ["local", "several_surfaces", "shared_or_system_wide"],
  data_security: ["none", "indirect", "direct_boundary_change"],
  reversibility: ["easy", "procedural_rollback", "difficult_or_stateful"],
  uncertainty: ["known_pattern", "some_unknowns", "novel_or_impact_unclear"],
};
export const REVIEW_FLOOR_TRIGGERS = [
  "authentication_or_authorization",
  "schema_or_migration",
  "data_deletion_or_retention",
  "complex_state_transition_or_orchestration_port",
  "cross_domain_shared_caller_change",
  "external_service_write_or_webhook",
  "destructive_or_irreversible_operation",
];
export const REVIEW_TIERS = ["T1", "T2", "T3"];
/** Minimum self-review depth implied by a risk assessment: any floor trigger or extreme axis value forces T3, any middle value forces T2. */
export function reviewTierFloor(assessment) {
  const values = Object.values(REVIEW_AXES).map((allowed, index) => ({
    allowed,
    value: assessment?.[Object.keys(REVIEW_AXES)[index]],
  }));
  if (
    (assessment?.floor_triggers ?? []).length > 0 ||
    values.some(({ allowed, value }) => value === allowed.at(-1))
  )
    return "T3";
  if (values.some(({ allowed, value }) => value === allowed.at(-2))) return "T2";
  return "T1";
}
/** Validate a self-review record including its risk assessment and depth-tier floor; format only, not review quality. */
export function validateReview(review) {
  const errors = [];
  if (!["pass", "fail"].includes(review?.verdict)) errors.push("verdict must be pass or fail");
  for (const field of [
    "source_comparison",
    "diff_assessment",
    "verification_assessment",
    "tier_rationale",
  ])
    if (!nonempty(review?.[field])) errors.push(`${field} is required`);
  if (!Array.isArray(review?.manual_results)) errors.push("manual_results must be an array");
  const assessment = review?.risk_assessment;
  let floor = null;
  if (!assessment || typeof assessment !== "object") {
    errors.push("risk_assessment is required");
  } else {
    let valid = true;
    for (const [axis, allowed] of Object.entries(REVIEW_AXES))
      if (!allowed.includes(assessment[axis])) {
        errors.push(`risk_assessment.${axis} must be one of ${allowed.join("/")}`);
        valid = false;
      }
    if (!Array.isArray(assessment.floor_triggers)) {
      errors.push("risk_assessment.floor_triggers must be an array");
      valid = false;
    } else if (assessment.floor_triggers.some((t) => !REVIEW_FLOOR_TRIGGERS.includes(t))) {
      errors.push("risk_assessment.floor_triggers entries must match process.yaml vocabulary");
      valid = false;
    }
    if (valid) floor = reviewTierFloor(assessment);
  }
  if (!REVIEW_TIERS.includes(review?.applied_tier))
    errors.push("applied_tier must be one of T1/T2/T3");
  else if (
    floor !== null &&
    REVIEW_TIERS.indexOf(review.applied_tier) < REVIEW_TIERS.indexOf(floor)
  )
    errors.push(`applied_tier is below the ${floor} floor implied by risk_assessment`);
  return errors;
}
/** Bind evidence to file content, the contract, and observable runtime identity. */
export function evidenceKey(cwd, contract) {
  return hash(
    JSON.stringify({
      content: fingerprint(cwd),
      contract,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    }),
  );
}
/** Compute missing current proof, manual judgments, and unresolved findings for completion. */
export function blockers(state, key) {
  const errors = validateContract(state.contract);
  if (errors.length) return errors;
  errors.push(...state.contract.unresolved.map((x) => `unresolved: ${x}`));
  for (const check of state.contract.checks) {
    const runs = state.runs.filter((r) => r.check === check.id && r.key === key);
    if (!runs.length || runs.at(-1).exit_code !== 0 || runs.at(-1).invalidated)
      errors.push(`check required: ${check.id}`);
  }
  const review = state.reviews.at(-1);
  if (!review || review.key !== key || review.verdict !== "pass")
    errors.push("current self-review required");
  const manual = [
    ...state.contract.acceptance,
    ...state.contract.preserve,
    ...state.contract.controls,
  ].filter((x) => nonempty(x.manual));
  for (const item of manual) {
    if (
      !review?.manual_results?.some(
        (r) => r.id === item.id && nonempty(r.evidence) && r.status === "pass",
      )
    )
      errors.push(`manual proof required: ${item.id}`);
  }
  for (const finding of state.findings)
    if (finding.status === "open") errors.push(`open finding: ${finding.id}`);
  return errors;
}
/** Atomically replace local state for the single-writer loop; this is not tamper protection. */
function save(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}
/** Mask known environment credentials and common token formats in local logs; not a complete secret scanner. */
function redact(text) {
  let value = String(text);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/secret|token|password|credential|api.?key/i.test(key) && secret?.length >= 4)
      value = value.split(secret).join("[REDACTED]");
  }
  return value.replace(/\b(?:gh[pousr]_[\w]+|sk-[\w-]+)\b/g, "[REDACTED]");
}
/** Reject mismatched PR identity and enforce the requested delivery target conservatively. */
export function validatePr(pr, { head, branch, base, target }) {
  if (
    pr.state !== "OPEN" ||
    pr.headRefOid !== head ||
    pr.headRefName !== branch ||
    pr.baseRefName !== base
  )
    throw new Error("PR identity/head/base mismatch");
  if (target !== "merge_ready") return;
  if (
    pr.isDraft ||
    pr.mergeable !== "MERGEABLE" ||
    pr.mergeStateStatus !== "CLEAN" ||
    !["", "APPROVED"].includes(pr.reviewDecision)
  )
    throw new Error("PR is not merge-ready");
  if (
    !Array.isArray(pr.statusCheckRollup) ||
    pr.statusCheckRollup.some((c) =>
      c.__typename === "CheckRun"
        ? c.status !== "COMPLETED" || !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(c.conclusion)
        : c.__typename !== "StatusContext" || c.state !== "SUCCESS",
    )
  )
    throw new Error("checks incomplete or failing");
}
/** Compare a PR URL repository boundary against a resolved GitHub owner/name. */
export function matchesRepository(url, repository) {
  return (
    typeof repository === "string" &&
    /^[^/]+\/[^/]+$/.test(repository) &&
    typeof url === "string" &&
    url.toLowerCase().startsWith(`https://github.com/${repository.toLowerCase()}/pull/`)
  );
}
/** Read canonical origin and PR identity through GitHub CLI, rejecting dirty or mismatched publication state. */
function observePr(cwd, url) {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(url))
    throw new Error("expected a GitHub PR URL");
  const remote = git(cwd, ["remote", "get-url", "origin"]);
  const repo = remote.match(/(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
  if (!repo) throw new Error("origin must be a GitHub repository");
  const resolved = spawnSync("gh", ["repo", "view", repo, "--json", "nameWithOwner"], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  if (resolved.status !== 0) throw new Error("cannot resolve origin repository");
  const canonical = JSON.parse(resolved.stdout).nameWithOwner;
  if (!matchesRepository(url, repo) && !matchesRepository(url, canonical))
    throw new Error("PR repository does not match origin");
  const fields =
    "url,state,headRefOid,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
  const result = spawnSync("gh", ["pr", "view", url, "--json", fields], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) throw new Error("GitHub observation failed");
  const pr = JSON.parse(result.stdout);
  if (!matchesRepository(pr.url, canonical)) throw new Error("observed PR repository mismatch");
  if (
    pr.state !== "OPEN" ||
    pr.headRefOid !== git(cwd, ["rev-parse", "HEAD"]) ||
    pr.headRefName !== git(cwd, ["branch", "--show-current"])
  )
    throw new Error("PR identity/head mismatch");
  if (git(cwd, ["status", "--porcelain"]))
    throw new Error("publish evidence requires a clean worktree");
  return pr;
}
/** Execute one task command, persisting actual check results or explicit judgments and rejecting incomplete delivery. */
export function run(args, cwd = process.cwd()) {
  const [command, id, ...rest] = args;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id ?? ""))
    throw new Error(
      "usage: task-loop <init|contract|check|review|finding|status|finish> <task-id> [arguments]",
    );
  if (
    path.resolve(git(cwd, ["rev-parse", "--show-toplevel"])).toLowerCase() !==
    path.resolve(cwd).toLowerCase()
  )
    throw new Error("run from worktree root");
  const directory = path.join(cwd, ".loop", "state", id);
  const file = path.join(directory, "state.json");
  if (command === "init") {
    if (existsSync(file)) throw new Error("task already exists");
    const preflight = spawnSync(
      process.execPath,
      ["scripts/check-task-worktree.mjs", "--require-clean"],
      { cwd, encoding: "utf8" },
    );
    if (preflight.status !== 0) throw new Error("workspace preflight failed");
    mkdirSync(directory, { recursive: true });
    save(file, {
      version: 13,
      id,
      branch: git(cwd, ["branch", "--show-current"]),
      contract: null,
      runs: [],
      reviews: [],
      findings: [],
      history: [{ event: "init", at: new Date().toISOString() }],
    });
    return { status: "initialized", id };
  }
  const state = json(file);
  if (
    state.version !== 13 ||
    state.id !== id ||
    state.branch !== git(cwd, ["branch", "--show-current"])
  )
    throw new Error("task identity mismatch");
  const event = { event: command, at: new Date().toISOString() };
  if (command === "contract") {
    const contract = json(rest[0]);
    const errors = validateContract(contract);
    if (errors.length) throw new Error(errors.join("; "));
    if (state.contract && !nonempty(rest[1]))
      throw new Error("contract revision requires a reason");
    event.previous = state.contract;
    event.reason = rest[1] ?? "initial contract";
    state.contract = contract;
  } else {
    const errors = validateContract(state.contract);
    if (errors.length) throw new Error(errors.join("; "));
    const key = evidenceKey(cwd, state.contract);
    if (command === "status")
      return {
        status: "observed",
        key,
        blockers: blockers(state, key),
        delivery_target: state.contract.delivery_target,
      };
    if (command === "check") {
      if (state.contract.unresolved.length)
        throw new Error("resolve material questions before verification");
      const check = state.contract.checks.find((x) => x.id === rest[0]);
      if (!check) throw new Error("unknown check");
      const started = Date.now();
      const result = spawnSync(check.argv[0], check.argv.slice(1), {
        cwd,
        encoding: "utf8",
        timeout: check.timeout_ms,
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
      });
      const log = `${randomUUID()}.log`;
      writeFileSync(
        path.join(directory, log),
        redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`),
      );
      const record = {
        check: check.id,
        key,
        argv: check.argv,
        exit_code: result.status,
        signal: result.signal,
        duration_ms: Date.now() - started,
        log,
        invalidated: key !== evidenceKey(cwd, state.contract),
      };
      state.runs.push(record);
      event.result = record;
    } else if (command === "review") {
      const review = json(rest[0]);
      const errors = validateReview(review);
      if (errors.length) throw new Error(`invalid review: ${errors.join("; ")}`);
      state.reviews.push({ ...review, key, kind: "self", at: event.at });
    } else if (command === "finding") {
      const finding = json(rest[0]);
      if (
        !nonempty(finding.id) ||
        !nonempty(finding.description) ||
        !["open", "resolved", "not_applicable"].includes(finding.status) ||
        !nonempty(finding.evidence)
      )
        throw new Error("invalid finding");
      const previous = state.findings.findIndex((x) => x.id === finding.id);
      event.previous = previous < 0 ? null : state.findings[previous];
      if (previous < 0) state.findings.push({ ...finding, key });
      else state.findings[previous] = { ...finding, key };
    } else if (command === "finish") {
      const missing = blockers(state, key);
      if (missing.length) throw new Error(missing.join("; "));
      if (state.contract.delivery_target !== "local_verified") {
        const pr = observePr(cwd, rest[0]);
        validatePr(pr, {
          head: git(cwd, ["rev-parse", "HEAD"]),
          branch: state.branch,
          base: state.contract.base_branch ?? "preview",
          target: state.contract.delivery_target,
        });
        if (evidenceKey(cwd, state.contract) !== key)
          throw new Error("content changed during PR observation");
        event.pr = pr;
      }
      event.key = key;
    } else throw new Error("unknown command");
  }
  state.history.push(event);
  save(file, state);
  if (command === "check" && (event.result.exit_code !== 0 || event.result.invalidated))
    throw new Error("check failed or content changed during check; inspect local log");
  return { status: command === "finish" ? "complete" : "recorded", id, event: command };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
