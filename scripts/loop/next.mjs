import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { validateAssessment } from "../review-depth.mjs";
import { USAGE_ROLES, readTranscriptUsage } from "../agent-usage.mjs";
import { checkKind, ciFlakyDiagnostics, extractCiFailures } from "../ci-failure.mjs";
import {
  aftercareSummary,
  computeAssessment,
  evaluateReviewCi,
  highestTier,
  missingRequirements,
  requireAssessmentAboveFloor,
  requireValue,
  requiresReviewCi,
  validateReview,
  validateSpec,
  verificationSummary,
} from "../loop-policy.mjs";
import { buildDraft } from "../loop-draft.mjs";
import { requiredKeys } from "../loop-schema.mjs";
import { hasPrepushMarker } from "../verify-prepush.mjs";
import { artifactManifest, runRequiredVerification, runVerification } from "./evidence.mjs";
import { publishTaskMetrics, recordMetric } from "./metrics.mjs";
import {
  aftercareFetchers,
  aftercareSnapshot,
  collectFindingsArgs,
  discoverPrNumber,
  ensureTaskPr,
  gh,
  githubAftercare,
  inspectPullRequest,
  requireIntervalSeconds,
  resolveRepositorySlug,
  restoreTask,
  syncPrStateBlock,
  tailLines,
  watchAftercare,
} from "./pr.mjs";
import { buildReviewPacket, collectReviewCiEvidence, waitForReviewCi } from "./review.mjs";
import {
  STATE_WORKFLOWS,
  acceptanceCriteriaHash,
  git,
  gitPath,
  history,
  invalidate,
  loadTask,
  nextActions,
  processConfig,
  readChangedPathsRevisioned,
  readSubmission,
  refreshTask,
  requireClean,
  safeChangedPaths,
  saveTask,
  startTask,
  stateBlock,
  taskPath,
  transitionTask,
} from "./state.mjs";

export function summarizeTask(task, root) {
  return {
    taskId: task.taskId,
    state: task.state,
    workflow: STATE_WORKFLOWS[task.state] ?? null,
    head: task.head,
    baseHead: task.baseHead,
    risk: task.risk,
    missing: missingRequirements(task, root),
    verification: verificationSummary(task),
    openFindings: (task.findings ?? []).filter((finding) => finding.status === "open").length,
    aftercare: aftercareSummary(task),
    next: nextActions(task, root),
  };
}
export function explainTask(task, root) {
  return {
    ...summarizeTask(task, root),
    requiredSkills: task.assessment?.requiredSkills ?? [],
    skills: task.skills ?? [],
    riskDetail: {
      retained: task.risk,
      assessment: task.assessment?.risk ?? null,
      agent: task.agentAssessment?.applied_tier ?? null,
    },
    verificationDetail: artifactManifest(task, root),
  };
}
/**
 * #958: ciFailure解決の実行体。verify-prepush.mjsは#957で導入されるため
 * 静的importせずspawnで呼ぶ（未マージ環境ではENOENTの明示エラー）。
 * hook経由起動を考慮してGIT_*を除去したenvで実行する。
 */
export function defaultVerifyPrepush(argv, root) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
/**
 * 未解決ciFailureをrunner自身が verify:prepush で解決する（AC5）。
 * e2e/unitの失敗は failedTests のファイルを --include で対象化し、
 * lint/build/process等のジョブ失敗は --include なしの全量実行。
 * exit 0のみ解決（marker残存だけでは解決にならない）。
 */
export function resolveCiFailures(task, root, services = {}) {
  const runVerify = services.verifyPrepush ?? defaultVerifyPrepush;
  const results = [];
  for (const failure of task.ciFailures ?? []) {
    if (failure.resolvedAt) continue;
    const files = ["e2e", "unit"].includes(checkKind(failure.check))
      ? [...new Set((failure.failedTests ?? []).map((t) => t.file).filter(Boolean))]
      : [];
    // verify-prepush.mjs の --include は1引数に1パス — 複数ファイルは繰り返す
    const argv = ["scripts/verify-prepush.mjs", ...files.flatMap((file) => ["--include", file])];
    const out = runVerify(argv, root);
    const status = out.status ?? 1;
    if (status === 0) {
      failure.resolvedAt = new Date().toISOString();
      failure.resolvedHead = task.head;
      history(task, "ci_failure_resolved", { check: failure.check, head: task.head });
    }
    results.push({
      check: failure.check,
      includeFiles: files,
      status,
      resolved: status === 0,
    });
  }
  recordMetric(task, root, { action: "resolve_ci_failures", results });
  return results;
}
export const CLI_ACTION_KEYS = [
  "init",
  "spec",
  "assessment",
  "verify",
  "verify-required",
  "review",
  "aftercare",
  "check-pr",
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
  "record-usage",
  "publish-metrics",
  "ci-failures",
  "resolve-ci-failures",
  "draft",
  "next",
];
/** Action keys that carry a second key as pure input, not as another action. */
export const actionKeyUsed = (args, key) =>
  args[key] &&
  !(args.draft && key === "event") &&
  // `--next --review <file>` feeds the review report into the auto-advance
  // pipeline; without `--next`, --review stays its own action.
  !(args.next && key === "review");
/**
 * Name reported in `cli_output` metrics. Watch runs are tagged separately so
 * their larger output can be compared against non-watch commands.
 */
export function cliCommandName(args) {
  const action = CLI_ACTION_KEYS.find((key) => actionKeyUsed(args, key));
  if (!action) return "none";
  return args["watch-aftercare"] ? `${action}+watch-aftercare` : action;
}
/**
 * #950: `--next` — run the current state's mechanical steps and stop at the
 * first point that needs an agent decision. Each invocation handles one state
 * (plus the mechanical entry work of the state it transitions into), records
 * every step as {action:"next"} metrics, and resumes idempotently because
 * every mutating helper already persists. Never fires decision-required,
 * resolved, human-gate-release, or ci_failure events — judgment stays with
 * the agent.
 */
export function runNext(args, root = process.cwd(), services = {}) {
  let task = refreshTask(loadTask(root), root);
  saveTask(task, root);
  const steps = [];
  const note = (step, ok = true) => {
    // steps[] は成功step名だけ（単一JSON契約）。失敗はmetricsにok=falseで残す。
    if (ok) steps.push(step);
    recordMetric(task, root, { action: "next", step, ok });
  };
  // runNextの返却は常に1個のJSON — どのstepも素のthrowで抜けない。
  const stepOr = (step, needs, fn, extra = {}) => {
    try {
      return fn();
    } catch (error) {
      note(step, false);
      return stop(needs, {
        error: tailLines({ stdout: String(error?.message ?? error) }),
        ...extra,
      });
    }
  };
  const stop = (needs, extra = {}) => ({
    taskId: task.taskId,
    state: task.state,
    needs,
    steps,
    next: nextActions(task, root),
    ...extra,
  });
  if (args.review && task.state !== "review")
    return stop("usage", { error: "--review is only accepted in review state" });
  const ghRunner = services.gh ?? ((a, r) => gh(a, r));
  const discoverPr = () => discoverPrNumber(task, root, ghRunner);
  if (task.state === "refine") {
    const missing = missingRequirements(task, root);
    if (missing.length) {
      const head = missing[0];
      const needs = head.startsWith("assessment")
        ? "assessment"
        : head.startsWith("skill:")
          ? "skills"
          : head === "openMaterialDecisions"
            ? "decisions"
            : "spec";
      return stop(needs, { missing });
    }
    const failed = stepOr("ready", "gate", () => {
      task = transitionTask(task, "ready", {}, root);
    });
    if (failed) return failed;
    saveTask(task, root);
    note("ready");
    return stop("implementation");
  }
  if (task.state === "execute") {
    try {
      requireClean(root);
    } catch {
      return stop("commit");
    }
    note("clean");
    if (!hasPrepushMarker(root, task.head)) {
      const out = (services.verifyPrepush ?? defaultVerifyPrepush)(
        ["scripts/verify-prepush.mjs"],
        root,
      );
      const ok = out.status === 0;
      note("verify:prepush", ok);
      if (!ok)
        return stop("verify:prepush", {
          command: "pnpm verify:prepush",
          outputTail: tailLines(out),
        });
    } else note("prepush_marker");
    // F4: 対象化した `--include` 再現runも同じmarkerを書くので、full prepushの
    // marker確認はciFailure再確認より先に行う（targeted runがfullを偽装しない）。
    const unresolved = () => (task.ciFailures ?? []).filter((f) => !f.resolvedAt);
    if (unresolved().length) {
      const failed = stepOr("ci_recheck", "ci_reproduce", () => {
        resolveCiFailures(task, root, services);
      });
      if (failed) return failed;
      saveTask(task, root);
      const remaining = unresolved();
      note("ci_recheck", remaining.length === 0);
      if (remaining.length) return stop("ci_reproduce", { ciFailures: remaining });
    }
    try {
      task = runRequiredVerification(task, root, services.runVerification);
    } catch (error) {
      note("verify", false);
      const needs = !task.assessment ? "assessment" : "verify";
      return stop(needs, {
        error: tailLines({ stdout: String(error?.message ?? error) }),
      });
    }
    saveTask(task, root);
    note("verify");
    const gateFail = stepOr("ready", "gate", () => {
      task = transitionTask(task, "ready", {}, root);
    });
    if (gateFail) return gateFail;
    saveTask(task, root);
    note("ready");
    // AC3: spec.prAllowed=falseはpush・PR作成を行わない許可ゲート。
    if (task.spec?.prAllowed !== true) return stop("pr_permission");
    try {
      ensureTaskPr(task, root, services);
    } catch (error) {
      note("pr", false);
      return stop("pr", {
        error: tailLines({ stdout: String(error?.message ?? error) }),
      });
    }
    note("pr");
    // task.state === "review" here — fall through to the review stage.
  }
  if (task.state === "review") {
    if (!args.review) {
      // A prior --next may have transitioned to review before PR creation
      // failed — retry it here so the draft PR exists before packet review.
      let pr = discoverPr();
      if (!pr && task.spec?.prAllowed === true) {
        try {
          ensureTaskPr(task, root, services);
        } catch (error) {
          note("pr", false);
          return stop("pr", {
            error: tailLines({ stdout: String(error?.message ?? error) }),
          });
        }
        note("pr");
        pr = discoverPr();
      }
      const dir = gitPath(root, [
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        `agent-review/${task.head.slice(0, 12)}`,
      ]);
      let externalFindings;
      if (pr) {
        // Best effort: findings collection needs gh and may legitimately be
        // absent (e.g. token without scope). The packet still carries the
        // diff and contracts without it.
        try {
          const { slug } = aftercareFetchers(pr, args.handled, root, services);
          const raw = (services.exec ?? execFileSync)(
            process.execPath,
            collectFindingsArgs(pr, args.handled, slug()),
            { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
          );
          mkdirSync(dir, { recursive: true });
          externalFindings = path.join(dir, "collected-findings.json");
          writeFileSync(externalFindings, raw, { mode: 0o600 });
        } catch {
          externalFindings = undefined;
        }
      }
      // #952: draft PRのCI結果を独立レビューの検証情報としてpacketへ載せる。
      const ci = collectReviewCiEvidence(task, pr, root, {
        handled: args.handled,
        fetchPr: services.fetchPr,
        resolveRepo: services.resolveRepo,
        gh: ghRunner,
      });
      let packet;
      const failed = stepOr("packet", "review", () => {
        packet = buildReviewPacket(task, dir, root, { externalFindings, ci });
      });
      if (failed) return failed;
      return stop("review", {
        packet,
        pr: pr ?? null,
        independent: task.assessment?.review?.independent === true,
      });
    }
    // --next --review <file>: verify the remaining REVIEW-clean requirements
    // (requiredVerificationKinds — lite tasks run process only, everything
    // else runs full unit), then record the report and transition.
    try {
      task = runRequiredVerification(task, root, services.runVerification);
    } catch (error) {
      note("verify", false);
      return stop("verify", {
        error: tailLines({ stdout: String(error?.message ?? error) }),
      });
    }
    saveTask(task, root);
    note("verify");
    let report;
    const submitFail = stepOr("review", "review", () => {
      report = readSubmission(args.review, "review");
      validateReview(task, report);
    });
    if (submitFail) return submitFail;
    task.review = report;
    task.findings = report.findings;
    history(task, "review_recorded", {
      reviewer: report.reviewer,
      findings: report.findings,
      baseHead: task.baseHead,
      acceptanceCriteria: report.acceptanceCriteria,
      independent: report.independent === true && report.context === "fresh",
      risk: highestTier(task.risk, task.assessment?.risk?.final),
      acHash: acceptanceCriteriaHash(task.spec),
    });
    refreshTask(task, root);
    saveTask(task, root);
    note("review");
    const open = (task.findings ?? []).filter((f) => f.status === "open");
    if (open.length) {
      const ids = open.map((f) => f.id);
      const requiredExit = requiredKeys(
        "exit",
        {
          event: "findings",
          state: task.state,
          counters: task.counters,
          limits: processConfig(root).limits,
        },
        root,
      );
      // The reassessment is a judgment call — --next cannot invent it.
      if (requiredExit.includes("reassessment"))
        return stop("reassessment", {
          findings: ids,
          command: "node scripts/loop-runner.mjs --event findings --exit <file>",
        });
      const failed = stepOr("findings", "gate", () => {
        task = transitionTask(task, "findings", { reason: ids.join(",") }, root);
      });
      if (failed) return failed;
      saveTask(task, root);
      note("findings");
      if (task.state === "incident") return stop("resolution");
      return stop("fix", { findings: ids });
    }
    // #952: T2/T3のREVIEW cleanは現在HEADのCI checkを正本とする。draft PRの
    // statusCheckRollupを評価し、全checkがacceptを満たすまでpollで待つ
    // （Agent harnessのみAFTERCAREへ送る）。失敗はci_failure相当（再現必須）、
    // .md以外でのSKIPPEDはci_unexpected_skipで止める。
    if (requiresReviewCi(task)) {
      const pr = discoverPr();
      if (!pr)
        return stop("pr", {
          error: "REVIEW clean requires the draft PR's CI checks (spec.prAllowed)",
        });
      const interval = args["interval-seconds"];
      requireIntervalSeconds(interval);
      const fetchers = aftercareFetchers(pr, args.handled, root, services);
      const paths = safeChangedPaths(root, task);
      let lastPrFields = null;
      const evaluate = () =>
        evaluateReviewCi((lastPrFields = (services.fetchPr ?? fetchers.fetchPr)()), task, paths);
      let outcome;
      const watchFailed = stepOr("ci", "ci_pending", () => {
        outcome = waitForReviewCi(evaluate, {
          intervalSeconds: interval === undefined ? undefined : Number(interval),
          sleep: services.sleep,
          tick: services.tick,
          maxSeconds: services.maxSeconds,
        });
      });
      if (watchFailed) return watchFailed;
      if (outcome.verdict === "failure") {
        const slug = services.resolveRepo ? services.resolveRepo() : fetchers.slug();
        const ciFailures = extractCiFailures({
          // 評価に使ったのと同じrollupスナップショットで抽出する（再fetchしない）。
          rollup: lastPrFields?.statusCheckRollup ?? [],
          head: task.head,
          slug,
          root,
          gh: ghRunner,
        });
        // transitionTaskのci_failure記録と同じdedup: 同checkの未解決は
        // 最新で置き換え、retryのたびに配列が膨らむのを防ぐ。reproductionは
        // --event ci_failure のexitで後から補完される。
        task.ciFailures = task.ciFailures ?? [];
        for (const record of ciFailures) {
          const stale = task.ciFailures.findIndex((f) => f.check === record.check && !f.resolvedAt);
          if (stale >= 0) task.ciFailures.splice(stale, 1);
          task.ciFailures.push({
            ...record,
            reproduction: null,
            recordedAt: new Date().toISOString(),
            resolvedAt: null,
            resolvedHead: null,
          });
        }
        saveTask(task, root);
        return stop("ci_reproduce", {
          ciFailures,
          watch: outcome,
          // review.stateの正規exit（process.yaml review.on.ci_failure → execute）。
          // reproductionが証跡として必須で、未解決recordはexecute readyを塞ぐ。
          command: "node scripts/loop-runner.mjs --event ci_failure --exit <file>",
        });
      }
      if (outcome.verdict === "unexpected_skip")
        return stop("ci_unexpected_skip", { watch: outcome });
      if (outcome.verdict !== "ok") return stop("ci_pending", { watch: outcome });
      task.reviewCi = {
        ok: true,
        head: task.head,
        baseHead: task.baseHead,
        checks: outcome.observed,
        checkedAt: new Date().toISOString(),
      };
      note("ci");
    }
    const failed = stepOr("clean", "review", () => {
      task = transitionTask(task, "clean", {}, root);
    });
    if (failed) return failed;
    saveTask(task, root);
    note("clean");
    return stop("aftercare");
  }
  if (task.state === "aftercare") {
    const pr = discoverPr();
    if (!pr) return stop("pr");
    const fetchers = aftercareFetchers(pr, args.handled, root, services);
    let prFields;
    let failed = stepOr("fetch-pr", "pr", () => {
      prFields = (services.fetchPr ?? fetchers.fetchPr)();
    });
    if (failed) return failed;
    // ready化をsync-prより先に行う。draft中のsync-prが発火させる `edited`
    // イベントは Agent harness を SKIPPED にし、そのcheck runが ready_for_review
    // の成功runより started_at で新しくなるとselectChecksの「最新が正本」判定で
    // required SUCCESSが永遠に観測されない（draft payloadでskip評価されるため）。
    // ready後の edited は draft=false で本実行され、skipped run自体が生まれない。
    if (prFields.isDraft === true) {
      failed = stepOr("pr_ready", "pr", () => {
        ghRunner(["pr", "ready", String(pr)], root);
      });
      if (failed) return failed;
    }
    failed = stepOr("sync-pr", "pr", () => {
      syncPrStateBlock(task, pr, root, services);
    });
    if (failed) return failed;
    const interval = args["interval-seconds"];
    requireIntervalSeconds(interval);
    let result;
    failed = stepOr("aftercare", "action_required", () => {
      result = watchAftercare(task, pr, root, {
        ...services,
        handled: args.handled,
        intervalSeconds: interval === undefined ? undefined : Number(interval),
      });
      task = result.task;
    });
    if (failed) return failed;
    saveTask(task, root);
    note("aftercare", result.ready);
    if (!result.ready) {
      const last = result.last;
      const failed = (last?.failed ?? []).filter((name) => !(last?.pending ?? []).includes(name));
      if (failed.length) {
        const slug = services.resolveRepo ? services.resolveRepo() : fetchers.slug();
        const ciFailures = extractCiFailures({
          rollup: (services.fetchPr ?? fetchers.fetchPr)().statusCheckRollup ?? [],
          head: task.head,
          slug,
          root,
          gh: (a, r) => ghRunner(a, r),
        });
        // AC2/AC7: report the reproduce target; the ci_failure event itself is
        // the agent's call (`--event ci_failure --exit <file>`), never auto-fired.
        return stop("ci_reproduce", { ciFailures, watch: last });
      }
      // action_required: a human/agent must act before aftercare can pass —
      // unhandled findings, unresolved threads, review requests, or a PR head
      // that drifted from the local task.
      const actionRequired =
        last?.unhandledFindings > 0 ||
        last?.unresolvedThreads > 0 ||
        ["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(last?.reviewDecision) ||
        (last?.head && last.head !== task.head) ||
        (last?.baseHead && last.baseHead !== task.baseHead);
      if (actionRequired) return stop("action_required", { watch: last });
      return stop("ci_pending", { watch: last });
    }
    try {
      requireClean(root);
    } catch {
      return stop("commit");
    }
    // F6: publishはdone遷移の前に行う — 遷移後に失敗するとdoneから再試行できない
    // （markerコメントは冪等なので先に投稿しても1件のまま）。
    failed = stepOr("publish-metrics", "metrics", () => {
      publishTaskMetrics(task, pr, root, services);
    });
    if (failed) return failed;
    failed = stepOr("ready", "gate", () => {
      task = transitionTask(task, "ready", {}, root);
    });
    if (failed) return failed;
    saveTask(task, root);
    note("ready");
    return { ...stop(null), done: true };
  }
  if (task.state === "incident") return stop("resolution");
  if (task.state === "human_gate") return stop("approval");
  // done
  return { ...stop(null), done: true };
}
export function run(args, root = process.cwd(), services = {}) {
  const actions = CLI_ACTION_KEYS.filter((key) => actionKeyUsed(args, key));
  requireValue(actions.length <= 1, "Run one task action at a time");
  // #950: `--next` drives one state forward on its own and bypasses the normal
  // dispatch — it composes the same handlers below rather than duplicating
  // them, and stops at the first point that needs a judgment call.
  if (args.next) return runNext(args, root, services);
  requireValue(
    !args["watch-aftercare"] || args.aftercare || args["check-pr"],
    "--watch-aftercare requires --aftercare or --check-pr",
  );
  requireValue(
    args["interval-seconds"] === undefined || args["watch-aftercare"],
    "--interval-seconds requires --watch-aftercare",
  );
  requireValue(args.scope === undefined || args.verify, "--scope requires --verify");
  requireValue(
    args["delta-from"] === undefined || args["review-packet"],
    "--delta-from requires --review-packet",
  );
  requireValue(
    args["full-review"] === undefined || args["review-packet"],
    "--full-review requires --review-packet",
  );
  requireValue(
    args["usage-role"] === undefined || args["record-usage"],
    "--usage-role requires --record-usage",
  );
  requireValue(
    args["external-findings"] === undefined || args["review-packet"],
    "--external-findings requires --review-packet",
  );
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
  if (args["record-usage"]) {
    // Observation only: never refreshes, invalidates or saves the task.
    const task = loadTask(root);
    const role = args["usage-role"] ?? "implementer";
    requireValue(
      USAGE_ROLES.includes(role),
      `--usage-role must be one of ${USAGE_ROLES.join("|")}`,
    );
    const usage = readTranscriptUsage(args["record-usage"]);
    requireValue(usage, "No token usage records found in transcript");
    const entry = {
      action: "usage",
      role,
      source: path.basename(args["record-usage"]),
      // Distinguishes same-named transcripts in different directories without
      // writing local filesystem layout into the metrics log.
      sourceId: createHash("sha256")
        .update(path.resolve(args["record-usage"]))
        .digest("hex")
        .slice(0, 16),
      ...usage,
    };
    recordMetric(task, root, entry);
    return { taskId: task.taskId, state: task.state, ...entry };
  }
  if (args["ci-failures"]) {
    // #958: 失敗checkの機械抽出（read-only）。ci_failure遷移exitへ貼る
    // ciFailure recordとローカル再現コマンドをここで生成する。
    const task = loadTask(root);
    const { fetchPr } = aftercareFetchers(args["ci-failures"], args.handled, root, services);
    const prFields = (services.fetchPr ?? fetchPr)();
    const head = prFields.headRefOid ?? task.head;
    const slug = services.resolveRepo
      ? services.resolveRepo()
      : resolveRepositorySlug(root, services);
    requireValue(slug, "Repository slug could not be resolved");
    const ghRunner = services.gh ?? ((a, r) => gh(a, r));
    return {
      taskId: task.taskId,
      state: task.state,
      ciFailures: extractCiFailures({
        rollup: prFields.statusCheckRollup ?? [],
        head,
        slug,
        root,
        gh: ghRunner,
      }),
    };
  }
  if (args["check-pr"]) {
    const task = loadTask(root);
    if (args["watch-aftercare"]) {
      const interval = args["interval-seconds"];
      requireIntervalSeconds(interval);
      const result = watchAftercare(task, args["check-pr"], root, {
        ...services,
        handled: args.handled,
        readOnly: true,
        intervalSeconds: interval === undefined ? undefined : Number(interval),
      });
      return {
        taskId: task.taskId,
        state: task.state,
        ready: result.ready,
        watch: { events: result.events, last: result.last },
        ...(result.reason ? { reason: result.reason } : {}),
      };
    }
    // #958: flaky(passed-on-retry)を観測面に出す。PRが赤でも診断が見えるよう
    // gate判定より先にPR状態を取り、flaky抽出を済ませる。取得失敗はflakyErrorsに残す。
    const fetchers = aftercareFetchers(args["check-pr"], args.handled, root, services);
    const before = services.before ?? (services.fetchPr ?? fetchers.fetchPr)();
    const findings = services.findings ?? (services.fetchFindings ?? fetchers.fetchFindings)();
    let flakyTests = [];
    let flakyErrors = [];
    try {
      const diagnostics = ciFlakyDiagnostics({
        rollup: before.statusCheckRollup ?? [],
        head: before.headRefOid,
        slug: fetchers.slug(),
        root,
        gh: services.gh ?? ((a, r) => gh(a, r)),
      });
      flakyTests = diagnostics.tests;
      flakyErrors = diagnostics.errors;
    } catch (error) {
      flakyErrors = [{ error: String(error?.message ?? error) }];
    }
    try {
      const { evidence, snapshot } = inspectPullRequest(
        task,
        args["check-pr"],
        args.handled,
        root,
        { ...services, before, findings },
      );
      return {
        taskId: task.taskId,
        state: task.state,
        ...snapshot,
        flakyTests,
        flakyErrors,
        checkedAt: evidence.checkedAt,
      };
    } catch (error) {
      // checkAftercareのgate失敗（check赤・未処理finding等）でもflaky診断を
      // 返す（観測面としてready:falseで応答）。HEAD/base変更やローカル改変
      // などの整合性エラーはgate失敗ではないので従来どおり投げる。
      const snapshot = aftercareSnapshot(
        before,
        task,
        findings,
        args["check-pr"],
        safeChangedPaths(root, task),
      );
      if (snapshot.ready) throw error;
      return {
        taskId: task.taskId,
        state: task.state,
        ...snapshot,
        flakyTests,
        flakyErrors,
        gateError: error.message,
      };
    }
  }
  if (args["publish-metrics"]) {
    const task = loadTask(root);
    return publishTaskMetrics(task, args["publish-metrics"], root, services);
  }
  if (args["hook-state"]) {
    // Read-only probe for runtime hooks (#945): never refreshes or saves the
    // task, and reports an uninitialized task as state:null instead of
    // failing so the caller can decide whether editing is allowed. Because
    // it skips refreshTask, it reports the persisted state even when a HEAD
    // move would have invalidated it; that is the required trade-off of the
    // read-only contract (a refresh would mutate the task), and the next
    // normal loop-runner invocation still refreshes as usual.
    const target = taskPath(root);
    if (!existsSync(target)) return { state: null, next: [] };
    const probe = JSON.parse(readFileSync(target, "utf8"));
    return { state: probe.state ?? null, next: nextActions(probe, root) };
  }
  if (args.draft) {
    // #948: emit a machine-prefilled draft JSON for the agent to complete.
    // Read-only like --hook-state: loads the persisted task without refresh
    // and never saves — the only write is the draft file under the git path.
    const kind = args.draft;
    requireValue(
      ["spec", "assessment", "review", "exit"].includes(kind),
      `--draft kind must be spec|assessment|review|exit (got ${kind})`,
    );
    requireValue(args.issue === undefined || kind === "spec", "--issue requires --draft spec");
    requireValue(kind !== "exit" || args.event !== undefined, "--draft exit requires --event");
    const target = taskPath(root);
    const task = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : null;
    requireValue(
      task !== null || kind === "spec",
      `--draft ${kind} requires an initialized task (run --init first)`,
    );
    let issueBody;
    if (args.issue !== undefined) {
      const issue = JSON.parse(
        (services.gh ?? gh)(["issue", "view", args.issue, "--json", "title,body"], root),
      );
      issueBody = issue.body ?? "";
    }
    // Only review/assessment drafts need revision context; a spec draft also
    // runs pre-init where no base ref may resolve at all.
    const needsRevision = kind === "assessment" || kind === "review";
    const baseRef = task?.baseRef ?? "origin/preview";
    const baseHead = needsRevision
      ? git(["rev-parse", "--verify", `${baseRef}^{commit}`], root)
      : null;
    const head = needsRevision ? git(["rev-parse", "HEAD"], root) : null;
    let machine = { floorTriggers: [], minimumTier: "T1" };
    if (kind === "assessment") {
      const paths = readChangedPathsRevisioned(root, baseHead, head);
      machine = computeAssessment(task, paths, root).risk;
      machine = {
        floorTriggers: machine.machineFloorTriggers ?? [],
        minimumTier: machine.machine ?? "T1",
      };
    }
    const draft = buildDraft({
      kind,
      task,
      event: args.event,
      issueBody,
      machine,
      head,
      baseHead,
      limits: processConfig(root).limits,
      root,
    });
    const dir = gitPath(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "agent-drafts",
    ]);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${kind}${args.event ? `-${args.event}` : ""}.json`);
    writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`, { mode: 0o600 });
    recordMetric(task, root, { action: "draft", kind, event: args.event ?? null });
    return {
      ...(task ? { taskId: task.taskId, state: task.state } : {}),
      kind,
      draft: file,
    };
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
    return { taskId: task.taskId, state: task.state };
  }
  if (args["resolve-ci-failures"]) {
    // #958 AC5: 未解決ciFailureをrunner自身がverify:prepushで解決する。
    // exit 0のみresolvedAt/resolvedHeadを記録（markerのみでは不十分）。
    // ci_failure遷移先(execute)かaftercareのみで実行する。
    requireValue(
      ["execute", "aftercare"].includes(task.state),
      "--resolve-ci-failures requires execute or aftercare state",
    );
    const results = resolveCiFailures(task, root, services);
    saveTask(task, root);
    return { taskId: task.taskId, state: task.state, ciFailureResolutions: results };
  }
  if (args.status) return task;
  if (args.explain) return explainTask(task, root);
  if (args.artifacts)
    return { taskId: task.taskId, state: task.state, artifacts: artifactManifest(task, root) };
  if (args["review-packet"]) {
    // #952: flag経路でもdraft PRのCI結果をpacketへ載せる（best-effort:
    // PR未検出やAPI失敗ではciを落とすだけでpacket生成自体は止めない）。
    const ghRunner = services.gh ?? ((a, r) => gh(a, r));
    const ci = collectReviewCiEvidence(task, discoverPrNumber(task, root, ghRunner), root, {
      handled: args.handled,
      fetchPr: services.fetchPr,
      resolveRepo: services.resolveRepo,
      gh: ghRunner,
    });
    return buildReviewPacket(task, args["review-packet"], root, {
      deltaFrom: args["delta-from"],
      full: args["full-review"] === true,
      externalFindings: args["external-findings"],
      ci,
    });
  }
  if (args["friction-note"] !== undefined) {
    requireValue(
      typeof args["friction-note"] === "string" && args["friction-note"].trim().length > 0,
      "--friction-note requires non-empty text",
    );
    task.frictionNote = args["friction-note"].trim();
    history(task, "friction_note", { note: task.frictionNote });
    recordMetric(task, root, { action: "friction_note", note: task.frictionNote.slice(0, 500) });
    saveTask(task, root);
    return task;
  }
  if (args.spec) {
    requireValue(task.state === "refine", "Spec changes require refine state");
    task.spec = readSubmission(args.spec, "spec");
    validateSpec(task.spec, root);
    task.risk = highestTier(task.risk, task.spec.predictedRisk);
    invalidate(task);
  }
  if (args.assessment) {
    requireValue(
      ["refine", "execute", "review"].includes(task.state),
      "Assess in refine/execute/review",
    );
    const assessment = readSubmission(args.assessment, "assessment");
    requireValue(validateAssessment(assessment).length === 0, "Invalid agent risk assessment");
    // #948: machine-derived draft values are a floor, not a suggestion —
    // data_security/reversibility/applied_tier may only be raised.
    requireAssessmentAboveFloor(assessment, {
      floorTriggers: task.assessment?.risk?.machineFloorTriggers ?? [],
      minimumTier: task.assessment?.risk?.machine ?? "T1",
    });
    task.agentAssessment = assessment;
    task.skills = args.skills?.split(",").filter(Boolean) ?? [];
    refreshTask(task, root);
    history(task, "assessed");
  }
  if (args.verify)
    task = runVerification(task, args.verify, root, undefined, { scope: args.scope });
  if (args["verify-required"]) task = runRequiredVerification(task, root, services.runVerification);
  if (args.review) {
    requireClean(root);
    requireValue(task.state === "review", "Record review in review state");
    const report = readSubmission(args.review, "review");
    validateReview(task, report);
    task.review = report;
    task.findings = report.findings;
    history(task, "review_recorded", {
      reviewer: report.reviewer,
      findings: report.findings,
      baseHead: task.baseHead,
      acceptanceCriteria: report.acceptanceCriteria,
      // What a later incremental review may rely on: independence, the tier
      // this review satisfied, and the exact acceptance criteria it covered.
      independent: report.independent === true && report.context === "fresh",
      risk: highestTier(task.risk, task.assessment?.risk?.final),
      acHash: acceptanceCriteriaHash(task.spec),
    });
    refreshTask(task, root);
  }
  if (args.aftercare) {
    requireClean(root);
    if (args["watch-aftercare"]) {
      const interval = args["interval-seconds"];
      requireIntervalSeconds(interval);
      const result = watchAftercare(task, args.aftercare, root, {
        ...services,
        handled: args.handled,
        intervalSeconds: interval === undefined ? undefined : Number(interval),
      });
      task = result.task;
      saveTask(task, root);
      if (!result.ready)
        return {
          taskId: task.taskId,
          state: task.state,
          watch: { events: result.events, last: result.last },
        };
      return { ...summarizeTask(task, root), watch: { events: result.events, last: result.last } };
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
    task = transitionTask(
      task,
      args.event,
      args.exit ? readSubmission(args.exit, "exit") : {},
      root,
    );
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
    return syncPrStateBlock(task, args["sync-pr"], root, services);
  }
  return task;
}
/**
 * Merge the fresh state block (and deferred-findings block) into the PR body
 * via `gh pr edit`. Shared by the `--sync-pr` action and `--next`'s aftercare
 * stage. Read-only against the task — sync never mutates state.
 */
