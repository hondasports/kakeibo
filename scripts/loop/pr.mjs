import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkAftercare,
  expectedCiChecks,
  requireValue,
  selectChecks,
  validateCheckpoint,
} from "../loop-policy.mjs";
import { recordMetric } from "./metrics.mjs";
import { summarizeTask } from "./next.mjs";
import {
  DEFERRED_END,
  DEFERRED_START,
  STATE_END,
  STATE_START,
  deferredBlock,
  git,
  history,
  hydrateExportedTask,
  readChangedPathsRevisioned,
  refreshTask,
  requireClean,
  safeChangedPaths,
  saveTask,
  stateBlock,
} from "./state.mjs";

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
  return hydrateExportedTask(JSON.parse(match[1]));
}
export const gh = (args, root) =>
  execFileSync("gh", args, { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
/**
 * #958: ciFailure解決の実行体。verify-prepush.mjsは#957で導入されるため
 * 静的importせずspawnで呼ぶ（未マージ環境ではENOENTの明示エラー）。
 * hook経由起動を考慮してGIT_*を除去したenvで実行する。
 */
export const AFTERCARE_PR_FIELDS =
  "number,state,isDraft,headRefOid,baseRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
/** owner/name slug parsed from a git remote URL (ssh or https); null when it does not match. */
export function repositorySlugFromRemoteUrl(url) {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?\s*$/.exec(url ?? "");
  return match ? `${match[1]}/${match[2]}` : null;
}
/**
 * Resolve the GitHub repository slug once per fetcher set: the origin remote
 * URL is parsed locally, and `gh repo view` is the single fallback. A null
 * result keeps collect-pr-findings' own per-call resolution as before.
 */
export function resolveRepositorySlug(root, services = {}) {
  const remoteUrl =
    services.remoteUrl ??
    (() => {
      try {
        if (!git(["remote"], root).split("\n").includes("origin")) return null;
        return git(["remote", "get-url", "origin"], root).trim();
      } catch {
        return null;
      }
    })();
  const slug = repositorySlugFromRemoteUrl(remoteUrl);
  if (slug) return slug;
  try {
    const parsed =
      services.repoView?.() ?? JSON.parse(gh(["repo", "view", "--json", "owner,name"], root));
    return parsed?.owner?.login && parsed?.name ? `${parsed.owner.login}/${parsed.name}` : null;
  } catch {
    return null;
  }
}
/** argv for the collect-pr-findings child process, including the deduplicated --repo. */
export function collectFindingsArgs(pr, handled, repoSlug) {
  const args = ["scripts/collect-pr-findings.mjs", "--pr", String(pr)];
  if (repoSlug) args.push("--repo", repoSlug);
  if (handled) args.push("--handled", handled);
  return args;
}
export function aftercareFetchers(pr, handled, root, services = {}) {
  // Lazy so injected fetchers never trigger a resolution, and memoized so a
  // single watch resolves the repository at most once (usually zero gh calls:
  // the origin remote URL parses locally, otherwise one `gh repo view`).
  let repoSlug;
  const slug = () => {
    if (repoSlug === undefined)
      repoSlug = services.resolveRepo
        ? services.resolveRepo()
        : resolveRepositorySlug(root, services);
    return repoSlug;
  };
  return {
    slug,
    fetchPr: () => JSON.parse(gh(["pr", "view", String(pr), "--json", AFTERCARE_PR_FIELDS], root)),
    fetchFindings: () => {
      const raw = (services.exec ?? execFileSync)(
        process.execPath,
        collectFindingsArgs(pr, handled, slug()),
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      return JSON.parse(raw.slice(raw.indexOf("{")));
    },
  };
}
export const checkPending = (check) =>
  (check.status && check.status !== "COMPLETED") ||
  (check.state && ["PENDING", "EXPECTED"].includes(check.state));
/** Shared --interval-seconds validation for both watch call sites. */
export const requireIntervalSeconds = (value) =>
  requireValue(
    value === undefined || (Number.isFinite(Number(value)) && Number(value) >= 1),
    "--interval-seconds must be a number >= 1",
  );
/** Compact per-poll snapshot for --watch-aftercare; never throws on the gate. */
export function aftercareSnapshot(prFields, task, findings, pr, paths = []) {
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
    checkAftercare(prFields, task, findings, paths);
    ready = true;
  } catch {
    ready = false;
  }
  return {
    pr: prFields.number ?? pr,
    ready,
    expectedChecks: expectedCiChecks(paths, task.assessment),
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
export const defaultSleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/**
 * Event emitted on a signature change: the first poll emits the full
 * snapshot; later polls emit only what changed — changed scalars plus
 * added/removed members of array fields — so long pending/failed check
 * lists are not repeated on every change.
 */
export function snapshotEvent(prev, next) {
  if (!prev) return { ...next, changed: false };
  const event = { changed: true, ready: next.ready };
  const added = {};
  const removed = {};
  const removedKeys = [];
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (key === "ready") continue; // always emitted above
    const before = prev[key];
    if (!Object.hasOwn(next, key)) {
      // JSON.stringify drops undefined, so a removed scalar key would be
      // invisible on the wire; report it by name (e.g. error clearing).
      removedKeys.push(key);
      continue;
    }
    const after = next[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (Array.isArray(before) && Array.isArray(after)) {
      const plus = after.filter((item) => !before.includes(item));
      const minus = before.filter((item) => !after.includes(item));
      if (plus.length) (added[key] ??= []).push(...plus);
      if (minus.length) (removed[key] ??= []).push(...minus);
      // Same members in a different order is still a signature change.
      if (!plus.length && !minus.length) event[key] = after;
    } else {
      event[key] = after;
    }
  }
  if (Object.keys(added).length) event.added = added;
  if (Object.keys(removed).length) event.removed = removed;
  if (removedKeys.length) event.removedKeys = removedKeys;
  return event;
}
/**
 * Poll the PR until the aftercare gate would pass or `maxSeconds` elapse.
 * Only signature changes are emitted as events; unchanged polls stay silent.
 * The returned `last` is the final full snapshot so the caller need not
 * reconstruct state from the diff events.
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
    readOnly = false,
  } = {},
) {
  requireValue(
    readOnly ? ["aftercare", "done"].includes(task.state) : task.state === "aftercare",
    "GitHub aftercare runs in aftercare (read-only observation also accepts done)",
  );
  if (readOnly) task = currentCheckpointTask(task, root);
  const tick = now ?? (() => Date.now());
  const pause = sleep ?? defaultSleep;
  // Injected fetchers use the exact same shape as production so tests exercise
  // the real call path instead of hiding it behind a different seam.
  const defaults = aftercareFetchers(pr, handled, root);
  const pollPr = fetchPr ?? defaults.fetchPr;
  const pollFindings = fetchFindings ?? defaults.fetchFindings;
  let lastPoll = null;
  const recordAftercare =
    record ??
    (readOnly
      ? (t) => {
          inspectPullRequest(t, pr, handled, root, {
            fetchPr: pollPr,
            fetchFindings: pollFindings,
            before: lastPoll?.prFields,
            findings: lastPoll?.findings,
          });
          return t;
        }
      : (t) =>
          githubAftercare(t, pr, handled, root, {
            fetchPr: pollPr,
            fetchFindings: pollFindings,
            before: lastPoll?.prFields,
            findings: lastPoll?.findings,
          }));
  const events = [];
  const deadline = tick() + maxSeconds * 1000;
  let signature = null;
  let prevSnapshot = null;
  let polls = 0;
  const watchPaths = safeChangedPaths(root, task);
  while (true) {
    polls += 1;
    let snapshot;
    try {
      const prFields = pollPr();
      const findings = pollFindings();
      lastPoll = { prFields, findings };
      snapshot = aftercareSnapshot(prFields, task, findings, pr, watchPaths);
    } catch (error) {
      // A transient fetch failure is a poll event, not a watch failure.
      snapshot = { pr, ready: false, error: String(error?.message ?? error) };
    }
    const nextSignature = JSON.stringify(snapshot);
    if (nextSignature !== signature) {
      events.push(snapshotEvent(prevSnapshot, snapshot));
      prevSnapshot = snapshot;
    }
    signature = nextSignature;
    if (snapshot.ready) {
      task = recordAftercare(task);
      recordMetric(task, root, { action: "watch_aftercare", polls, ready: true });
      return { task, events, last: snapshot, ready: true };
    }
    if (
      readOnly &&
      (snapshot.unhandledFindings > 0 ||
        snapshot.unresolvedThreads > 0 ||
        snapshot.failed?.some((name) => !snapshot.pending.includes(name)) ||
        ["CHANGES_REQUESTED", "REVIEW_REQUIRED"].includes(snapshot.reviewDecision) ||
        (snapshot.head && snapshot.head !== task.head) ||
        (snapshot.baseHead && snapshot.baseHead !== task.baseHead))
    ) {
      recordMetric(task, root, { action: "watch_aftercare", polls, ready: false, readOnly: true });
      return { task, events, last: snapshot, ready: false, reason: "action_required" };
    }
    if (tick() >= deadline) {
      recordMetric(task, root, { action: "watch_aftercare", polls, ready: false });
      return { task, events, last: snapshot, ready: false };
    }
    pause(intervalSeconds * 1000);
  }
}
export function githubAftercare(task, pr, handled, root, services = {}) {
  requireValue(task.state === "aftercare", "GitHub aftercare runs in aftercare");
  task.aftercare = null;
  saveTask(task, root);
  const { evidence } = inspectPullRequest(task, pr, handled, root, services);
  task.aftercare = evidence;
  history(task, "github_verified", { pr: evidence.pr });
  recordMetric(task, root, { action: "aftercare", pr: evidence.pr, ready: evidence.ready });
  return task;
}
/**
 * Publish the task's metrics summary to the PR's single marked comment
 * (`<!-- agent-metrics:v1 task=... -->`): update in place when present,
 * create otherwise. State file is never touched — same non-mutating class
 * as --check-pr (the cli_output metric append is observability, not state).
 */
export function inspectPullRequest(task, pr, handled, root, services = {}) {
  task = currentCheckpointTask(task, root);
  const defaults = aftercareFetchers(pr, handled, root, services);
  const fetchPr = services.fetchPr ?? defaults.fetchPr;
  const fetchFindings = services.fetchFindings ?? defaults.fetchFindings;
  // A watch that already polled may pass its `before`/`findings` so the only
  // extra fetch on the ready path is the single `after` fetchPr (TOCTOU check).
  const before = services.before ?? fetchPr();
  const findings = services.findings ?? fetchFindings();
  const prPaths = safeChangedPaths(root, task);
  const evidence = checkAftercare(before, task, findings, prPaths);
  const after = fetchPr();
  checkAftercare(after, task, findings, prPaths);
  requireValue(
    before.baseRefName === after.baseRefName && before.headRefOid === after.headRefOid,
    "PR changed during aftercare",
  );
  requireClean(root);
  requireValue(
    git(["rev-parse", "HEAD"], root) === task.head &&
      git(["rev-parse", `${task.baseRef}^{commit}`], root) === task.baseHead,
    "Local revision changed during PR observation",
  );
  return {
    evidence,
    snapshot: aftercareSnapshot(after, task, findings, pr, prPaths),
    // #958: flaky診断など観測専用の下流利用（追加フィールドはgateに使わない）
    prFields: after,
  };
}
/** Recompute delivery requirements without rewriting the restored checkpoint. */
export function currentCheckpointTask(task, root) {
  requireClean(root);
  const head = git(["rev-parse", "HEAD"], root);
  const baseHead = git(["rev-parse", "--verify", `${task.baseRef}^{commit}`], root);
  const assessment = validateCheckpoint(task, {
    head,
    baseHead,
    paths: readChangedPathsRevisioned(root, baseHead, head),
    root,
  });
  return { ...task, assessment };
}
export function discoverPrNumber(task, root, ghRunner) {
  if (task.aftercare?.pr) return task.aftercare.pr;
  try {
    const listed = JSON.parse(
      ghRunner(["pr", "list", "--head", task.branch, "--state", "open", "--json", "number"], root),
    );
    return listed?.[0]?.number ?? null;
  } catch {
    return null;
  }
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
export const tailLines = (out) =>
  String(out?.stdout ?? out?.stderr ?? "")
    .split("\n")
    .slice(-20)
    .join("\n");
export const ISSUE_TASK_PATTERN = /^i(\d+)$/;
/**
 * Draft PR body: the repo template with the mechanical placeholders filled —
 * a task-scoped summary, the closing issue reference, the risk tier, and a
 * non-publishable update spec (agents default to not publishing; a human can
 * flip it when the change is product-facing).
 */
export function draftPrBody(task, root = process.cwd()) {
  const templatePath = path.join(root, ".github", "pull_request_template.md");
  const issue = ISSUE_TASK_PATTERN.exec(task.taskId)?.[1];
  const summary = (task.spec?.goal ?? "").split("\n")[0].trim() || task.taskId;
  const risk = { T1: "Low", T2: "Medium", T3: "High" }[task.risk] ?? "Medium";
  const updateYaml = [
    "<!-- suzumemo-update:start -->",
    "```yaml",
    "publish: false",
    // コロンを含む日本語文はクオート必須（update-spec validatorが YAML parse する）
    'reason: "ハーネス生成の下書き（掲載する場合は publish を true にして category と description を記入する）"',
    "```",
    "<!-- suzumemo-update:end -->",
  ].join("\n");
  if (!existsSync(templatePath))
    return [
      "## 概要",
      "",
      summary,
      "",
      "## 関連Issue",
      "",
      issue ? `Closes #${issue}` : "—",
      "",
      updateYaml,
      "",
    ].join("\n");
  let body = readFileSync(templatePath, "utf8");
  body = body.replace("## 概要", `## 概要\n\n${summary}`);
  body = body.replace("## 変更内容", `## 変更内容\n\n- ${summary}`);
  // F7: テンプレのHTMLコメント例 `Closes #123` を壊さないよう、数字が続かない
  // 本物の `Closes #` だけを置き換える。
  if (issue) body = body.replace(/Closes #(?!\d)/, `Closes #${issue} `);
  body = body.replace("Risk: ", `Risk: ${risk}`);
  body = body.replace("結果:", "結果: 成功（`--next` 実行: process/lint/unit/build、E2EはCI）");
  body = body.replace(
    /<!-- suzumemo-update:start -->[\s\S]*?<!-- suzumemo-update:end -->/,
    () => updateYaml,
  );
  return body;
}
export function derivePrTitle(task) {
  const first = (task.spec?.goal ?? task.taskId).split("\n")[0].trim() || task.taskId;
  const issue = ISSUE_TASK_PATTERN.exec(task.taskId)?.[1];
  const suffix = issue ? ` (#${issue})` : "";
  const max = 100 - suffix.length;
  return `${first.length > max ? `${first.slice(0, max - 1)}…` : first}${suffix}`;
}
/**
 * Push the task branch and create the draft PR when none exists; returns the
 * PR number. Only called when spec.prAllowed === true.
 */
export function ensureTaskPr(task, root = process.cwd(), services = {}) {
  const ghRunner = services.gh ?? ((a, r) => gh(a, r));
  (services.push ?? ((branch, r) => git(["push", "-u", "origin", branch], r)))(task.branch, root);
  const listed = JSON.parse(
    ghRunner(["pr", "list", "--head", task.branch, "--state", "open", "--json", "number"], root),
  );
  if (listed?.[0]?.number) return listed[0].number;
  const temp = mkdtempSync(path.join(tmpdir(), "agent-pr-"));
  try {
    const file = path.join(temp, "body.md");
    writeFileSync(file, draftPrBody(task, root), { mode: 0o600 });
    // F3: baseRef は `origin/preview` のようなremote追跡refで保持され得るが、
    // `gh pr create --base` はブランチ名しか受け付けない（remote/branch 404）。
    // 実在するremote名の接頭辞だけ剥がし、素のブランチ名（feature/foo）は触らない。
    const remoteNames = new Set(
      (services.git ?? ((a, r) => git(a, r)))(["remote"], root).split("\n").filter(Boolean),
    );
    const rawBase = task.baseRef ?? "preview";
    const slash = rawBase.indexOf("/");
    const baseName =
      slash > 0 && remoteNames.has(rawBase.slice(0, slash)) ? rawBase.slice(slash + 1) : rawBase;
    // `gh pr create` has no --json: stdout is the PR URL. Tolerate JSON output
    // too (test doubles), then fall back to re-listing the branch's open PR.
    const out = ghRunner(
      [
        "pr",
        "create",
        "--draft",
        "--title",
        derivePrTitle(task),
        "--body-file",
        file,
        "--base",
        baseName,
        "--head",
        task.branch,
      ],
      root,
    );
    let number;
    try {
      number = JSON.parse(out)?.number;
    } catch {
      number = /\/pull\/(\d+)/.exec(out)?.[1];
    }
    if (number) return Number(number);
    const relisted = JSON.parse(
      ghRunner(["pr", "list", "--head", task.branch, "--state", "open", "--json", "number"], root),
    );
    requireValue(relisted?.[0]?.number, "draft PR was created but its number could not be read");
    return relisted[0].number;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function syncPrStateBlock(task, pr, root = process.cwd(), services = {}) {
  const block = stateBlock(task);
  const ghRunner = services.gh ?? gh;
  const prInfo = JSON.parse(
    ghRunner(["pr", "view", String(pr), "--json", "body,headRefOid,baseRefOid"], root),
  );
  requireValue(
    prInfo.headRefOid === task.head && prInfo.baseRefOid === task.baseHead,
    "PR revision differs from local task",
  );
  let body = prInfo.body.includes(STATE_START)
    ? prInfo.body.replace(
        /<!-- suzumemo-agent-state:start -->[\s\S]*?<!-- suzumemo-agent-state:end -->/,
        () => block,
      )
    : `${prInfo.body}\n\n${block}`;
  const deferred = deferredBlock(task);
  // A dangling START marker without END (manual corruption only — the
  // tool never emits one) would satisfy includes(START) while the
  // replace below needs END, silently dropping the fresh deferred
  // list. Strip it first so the block is re-appended cleanly.
  if (body.includes(DEFERRED_START) && !body.includes(DEFERRED_END))
    body = body.replace(/[^\n]*<!-- suzumemo-agent-deferred:start -->/g, "");
  if (body.includes(DEFERRED_START))
    body = body.replace(
      /\n*<!-- suzumemo-agent-deferred:start -->[\s\S]*?<!-- suzumemo-agent-deferred:end -->/,
      () => (deferred ? `\n\n${deferred}` : ""),
    );
  else if (deferred) body = `${body}\n\n${deferred}`;
  if (body === prInfo.body) return { ...summarizeTask(task, root), pr: String(pr), synced: false };
  const temp = mkdtempSync(path.join(tmpdir(), "agent-state-"));
  try {
    const file = path.join(temp, "body.md");
    writeFileSync(file, body, { mode: 0o600 });
    ghRunner(["pr", "edit", String(pr), "--body-file", file], root);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return { ...summarizeTask(task, root), pr: String(pr), synced: true };
}
/**
 * Record the byte size of what a CLI run emitted so the effect of
 * output-shrinking work is measurable per command. The task may be absent
 * (pre-init or early failures) — recordMetric accepts null and stays
 * best-effort, never affecting output or exit codes.
 */
