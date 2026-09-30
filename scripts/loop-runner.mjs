import { existsSync, readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveAgentProfile } from "./resolve-agent-profile.mjs";
import { readChangedPaths } from "./suggest-skills.mjs";
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
} from "./loop-policy.mjs";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const git = (args, root) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const processConfig = (root) =>
  YAML.parse(readFileSync(path.join(root, ".agent/process.yaml"), "utf8"));
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
    "Task not initialized; run loop:state --init <spec.json> --task <id> --model <model> --runtime <runtime> --implementer <id>",
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
export function refreshTask(task, root) {
  const branch = git(["branch", "--show-current"], root);
  requireValue(branch === task.branch, "Task branch changed; restore or start the correct task");
  const head = git(["rev-parse", "HEAD"], root);
  const baseHead = git(["rev-parse", "--verify", `${task.baseRef}^{commit}`], root);
  if (head !== task.head || baseHead !== task.baseHead) {
    invalidate(task);
    task.head = head;
    task.baseHead = baseHead;
    if (!["refine", "incident", "human_gate"].includes(task.state)) task.state = "execute";
    history(task, "revision_changed");
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
  execFileSync(process.execPath, ["scripts/check-task-worktree.mjs", "--require-clean"], {
    cwd: root,
    stdio: "pipe",
  });
  requireValue(
    args.model && args.runtime && args.task && args.implementer,
    "Startup requires model, runtime, task and implementer",
  );
  const spec = readJson(args.init);
  // Open decisions are allowed in REFINE; leaving it requires a complete spec.
  const configuration = resolveAgentProfile({
    model: args.model,
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
  history(task, event, { exit });
  if (event === "findings") task.counters.review += 1;
  if (event === "ci_failure") task.counters.ci += 1;
  if (["findings", "ci_failure"].includes(event)) invalidate(task);
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
  return task;
}
export function recordFailure(task, signature, root) {
  task.attempt += 1;
  task.counters.sameFailure =
    task.lastFailure?.signature === signature ? task.counters.sameFailure + 1 : 1;
  task.lastFailure = { signature, head: task.head };
  history(task, "verification_failed", { signature });
  if (task.counters.sameFailure >= processConfig(root).limits.same_failure_max)
    task.state = "incident";
}
export function runVerification(
  task,
  kind,
  root,
  run = (cmd) => spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: "inherit" }),
) {
  requireValue(task.state === "execute", "Verification runs in execute");
  requireValue(CHECK_COMMANDS[kind], `Unknown verification kind: ${kind}`);
  requireClean(root);
  const before = { head: task.head, baseHead: task.baseHead };
  delete task.verification[kind];
  for (const command of CHECK_COMMANDS[kind]) {
    const result = run(command);
    if (result.status !== 0) {
      recordFailure(
        task,
        createHash("sha256")
          .update(JSON.stringify({ kind, command, status: result.status }))
          .digest("hex"),
        root,
      );
      task.lastFailure.kind = kind;
      saveTask(task, root);
      throw new Error(`Verification failed: ${kind}; state=${task.state}`);
    }
  }
  refreshTask(task, root);
  requireClean(root);
  requireValue(
    task.head === before.head && task.baseHead === before.baseHead,
    "Revision changed during verification",
  );
  task.verification[kind] = {
    ...before,
    success: true,
    commands: CHECK_COMMANDS[kind],
    checkedAt: new Date().toISOString(),
  };
  if (task.lastFailure?.kind === kind) {
    task.counters.sameFailure = 0;
    task.lastFailure = null;
  }
  return task;
}
export const STATE_START = "<!-- suzumemo-agent-state:start -->";
export const STATE_END = "<!-- suzumemo-agent-state:end -->";
export function stateBlock(task) {
  return `${STATE_START}\n\`\`\`json\n${JSON.stringify(task, null, 2)}\n\`\`\`\n${STATE_END}`;
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
export function githubAftercare(task, pr, handled, root) {
  requireValue(task.state === "aftercare", "GitHub aftercare runs in aftercare");
  task.aftercare = null;
  saveTask(task, root);
  const fields =
    "number,state,isDraft,headRefOid,baseRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
  const fetchPr = () => JSON.parse(gh(["pr", "view", String(pr), "--json", fields], root));
  const before = fetchPr();
  const args = ["scripts/collect-pr-findings.mjs", "--pr", String(pr)];
  if (handled) args.push("--handled", handled);
  const raw = execFileSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const findings = JSON.parse(raw.slice(raw.indexOf("{")));
  const evidence = checkAftercare(before, task, findings);
  const after = fetchPr();
  checkAftercare(after, task, findings);
  requireValue(
    before.baseRefName === after.baseRefName && before.headRefOid === after.headRefOid,
    "PR changed during aftercare",
  );
  task.aftercare = evidence;
  history(task, "github_verified", { pr: pr.number ?? pr });
  return task;
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
  const flags = new Set(["--export", "--assert-started"]);
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
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
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
    "assert-started",
  ].filter((key) => args[key]);
  requireValue(actions.length <= 1, "Run one task action at a time");
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
  if (args.spec) {
    requireValue(task.state === "refine", "Spec changes require refine state");
    task.spec = readJson(args.spec);
    validateSpec(task.spec, root);
    task.risk = highestTier(task.risk, task.spec.predictedRisk);
    invalidate(task);
  }
  if (args.assessment) {
    requireValue(["execute", "review"].includes(task.state), "Assess in execute/review");
    const assessment = readJson(args.assessment);
    requireValue(validateAssessment(assessment).length === 0, "Invalid agent risk assessment");
    task.agentAssessment = assessment;
    task.skills = args.skills?.split(",").filter(Boolean) ?? [];
    refreshTask(task, root);
    history(task, "assessed");
  }
  if (args.verify) task = runVerification(task, args.verify, root);
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
    task = githubAftercare(task, args.aftercare, args.handled, root);
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
  if (args.export || args["sync-pr"]) {
    requireClean(root);
    requireValue(
      ["aftercare", "done"].includes(task.state),
      "Only reviewed tasks can be published",
    );
    const block = stateBlock(task);
    if (args.export) return block;
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
        : JSON.stringify(
            result.version === 2
              ? {
                  taskId: result.taskId,
                  state: result.state,
                  head: result.head,
                  baseHead: result.baseHead,
                  risk: result.risk,
                  configuration: result.configuration,
                  assessment: result.assessment,
                  verified: Object.keys(result.verification),
                  openFindings: (result.findings ?? []).filter(
                    (finding) => finding.status === "open",
                  ).length,
                }
              : result,
            null,
            2,
          ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
