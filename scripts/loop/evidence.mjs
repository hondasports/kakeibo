import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeChangedPath } from "../classify-e2e-relevance.mjs";
import {
  CHECK_COMMANDS,
  currentEvidence,
  isFullScopeEvidence,
  processSuiteExcludes,
  requireValue,
  requiredVerificationKinds,
  unitFullCommand,
} from "../loop-policy.mjs";
import { recordMetric } from "./metrics.mjs";
import {
  git,
  gitPath,
  isUnitRelatedPath,
  readChangedPathsRevisioned,
  recordFailure,
  refreshTask,
  requireClean,
  saveTask,
} from "./state.mjs";

export const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const requireSafeTaskId = (taskId) =>
  requireValue(
    typeof taskId === "string" && SAFE_TASK_ID.test(taskId) && !taskId.includes(".."),
    `Invalid task id for artifact paths: ${taskId}`,
  );
export const evidenceRoot = (root) =>
  gitPath(root, ["rev-parse", "--path-format=absolute", "--git-path", "agent-evidence"]);
export const evidenceDir = (task, root) => {
  requireSafeTaskId(task.taskId);
  return path.join(evidenceRoot(root), task.taskId, task.head.slice(0, 12));
};
// Persisted manifests store paths relative to the evidence root so state blocks
// stay portable and never leak local filesystem layout into the PR body.
export const resolveArtifactPath = (root, stored) =>
  path.isAbsolute(stored) ? stored : path.join(evidenceRoot(root), stored);
export const lastLines = (text, count = 20) => text.trimEnd().split("\n").slice(-count);
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
  requireValue(
    ["execute", "review"].includes(task.state),
    "Verification runs in execute (review may complete the full unit suite)",
  );
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
  // extensions, present on disk, outside e2e/ and metadata-only paths). Files
  // without related tests pass (--passWithNoTests): affected evidence only
  // satisfies EXECUTE→REVIEW, and every later gate requires the full suite.
  // An empty candidate set reverts to the full suite, recorded as scope "full".
  // The full unit suite excludes the process suite files, which the
  // always-required process kind executes.
  let commands = kind === "unit" ? unitFullCommand(root) : CHECK_COMMANDS[kind];
  let appliedScope = "full";
  let affectedFiles = null;
  if (kind === "unit" && scope === "affected") {
    affectedFiles = readChangedPathsRevisioned(
      root,
      task.baseHead,
      git(["rev-parse", "HEAD"], root),
    )
      .map(normalizeChangedPath)
      .filter((file) => isUnitRelatedPath(file) && existsSync(path.join(root, file)));
    if (affectedFiles.length > 0) {
      commands = [
        [
          "pnpm",
          "exec",
          "vitest",
          "related",
          ...affectedFiles,
          "--run",
          "--passWithNoTests",
          ...processSuiteExcludes(root),
        ],
      ];
      appliedScope = "affected";
    }
  }
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
/**
 * Run missing required checks serially; each completed kind is durably saved.
 * In EXECUTE the unit kind runs affected-scope (EXECUTE→REVIEW accepts it); in
 * REVIEW it completes the full suite, which REVIEW clean and every later gate
 * require — so the full run can overlap the independent review.
 */
export function runRequiredVerification(task, root, run) {
  requireValue(
    ["execute", "review"].includes(task.state),
    "Verification runs in execute or review",
  );
  const fullUnit = task.state === "review";
  requireValue(task.assessment && task.agentAssessment, "Current change assessment is required");
  requireClean(root);
  const before = { head: task.head, baseHead: task.baseHead };
  const unchanged = () =>
    git(["rev-parse", "HEAD"], root) === before.head &&
    git(["rev-parse", `${task.baseRef}^{commit}`], root) === before.baseHead;
  requireValue(unchanged(), "Revision changed during required verification");
  for (const kind of requiredVerificationKinds(task)) {
    const evidence = task.verification[kind];
    if (
      evidence?.success === true &&
      currentEvidence(evidence, task) &&
      (kind !== "unit" || !fullUnit || isFullScopeEvidence(evidence))
    )
      continue;
    requireValue(unchanged(), "Revision changed during required verification");
    task = runVerification(task, kind, root, run, {
      scope: kind === "unit" && !fullUnit ? "affected" : "full",
    });
    saveTask(task, root);
  }
  requireClean(root);
  requireValue(unchanged(), "Revision changed during required verification");
  return task;
}
export function artifactManifest(task, root = process.cwd()) {
  const manifest = {};
  for (const [kind, evidence] of Object.entries(task.verification ?? {})) {
    const artifact = evidence.artifact
      ? (() => {
          const resolved = resolveArtifactPath(root, evidence.artifact.path);
          return {
            path: evidence.artifact.path,
            resolved,
            sha256: evidence.artifact.sha256,
            bytes: evidence.artifact.bytes,
            available: existsSync(resolved),
          };
        })()
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
    };
  }
  return manifest;
}
/**
 * Reviewer-facing verification evidence for review packets — same conclusion
 * (success, scope, log tail, artifact path) without the
 * fingerprints a reviewer never checks (run/appliesTo hashes, resolved
 * absolute paths, artifact sha256/bytes). The full manifest stays available
 * via `--artifacts` in the implementer's worktree.
 */
export function reviewerVerificationManifest(task) {
  const manifest = {};
  for (const [kind, evidence] of Object.entries(task.verification ?? {})) {
    manifest[kind] = {
      success: evidence.success === true,
      scope: evidence.run?.scope ?? null,
      ...(evidence.run?.affectedFiles ? { affectedFiles: evidence.run.affectedFiles } : {}),
      summary: evidence.summary ?? null,
      artifact: evidence.artifact?.path ?? null,
    };
  }
  return manifest;
}
