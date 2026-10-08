import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { requireValue } from "../loop-policy.mjs";
import {
  metricsCommentMarker,
  readMetricsEntries,
  renderMetricsComment,
  summarizeTask as summarizeTaskMetrics,
  taskSummaryContext,
} from "../loop-metrics.mjs";
import { gh, resolveRepositorySlug } from "./pr.mjs";
import { gitPath } from "./state.mjs";

/**
 * Best-effort metrics sink shared across linked worktrees (the common git
 * dir), never the worktree-private `--git-path` location. Failures never
 * block the caller — observability must not become a gate.
 */
export function metricsPath(root, env = process.env) {
  // An explicit sink always wins; a test run without one must never append to
  // the developer's real repository log.
  if (env.AGENT_METRICS_FILE) return env.AGENT_METRICS_FILE;
  if (env.VITEST) return null;
  return path.join(
    gitPath(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    "agent-metrics.jsonl",
  );
}
export function recordMetric(task, root, entry) {
  try {
    const file = metricsPath(root);
    if (!file) return;
    appendFileSync(
      file,
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
export function publishTaskMetrics(task, pr, root = process.cwd(), services = {}) {
  requireValue(
    ["aftercare", "done"].includes(task.state),
    "Metrics publish runs in aftercare or done",
  );
  const file = metricsPath(root);
  const entries = file && existsSync(file) ? readMetricsEntries(file).entries : [];
  const summary = summarizeTaskMetrics(entries, task.taskId, taskSummaryContext(task, root));
  const body = renderMetricsComment(summary);
  const slug = resolveRepositorySlug(root, services);
  requireValue(slug, "Repository slug not resolved");
  const run = services.gh ?? gh;
  const marker = metricsCommentMarker(task.taskId);
  let existing = null;
  for (let page = 1; ; page += 1) {
    const batch = JSON.parse(
      run(["api", `repos/${slug}/issues/${pr}/comments?per_page=100&page=${page}`], root),
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    // Whole-line marker match: a quoted or embedded marker (e.g. someone
    // quoting the comment) must not be picked as the publish target.
    const marked = batch.filter(
      (comment) =>
        typeof comment?.body === "string" &&
        comment.body.split("\n").some((line) => line.trim() === marker),
    );
    existing = marked.find((comment) => comment?.user?.type === "Bot") ?? marked[0] ?? existing;
    if (existing || batch.length < 100) break;
  }
  const result = existing
    ? JSON.parse(
        run(
          [
            "api",
            `repos/${slug}/issues/comments/${existing.id}`,
            "-X",
            "PATCH",
            "-f",
            `body=${body}`,
          ],
          root,
        ),
      )
    : JSON.parse(run(["api", `repos/${slug}/issues/${pr}/comments`, "-f", `body=${body}`], root));
  return {
    taskId: task.taskId,
    state: task.state,
    published: existing ? "updated" : "created",
    commentUrl: result?.html_url ?? null,
    pr: Number(pr),
  };
}
/** Live delivery observation: remote reads only, no task or PR writes. */
