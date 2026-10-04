import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStateBlock } from "./loop-runner.mjs";
import { validateCheckpoint } from "./loop-policy.mjs";
import { readChangedFiles } from "./classify-e2e-relevance.mjs";
import { requireValue } from "./loop-policy.mjs";
export { validateCheckpoint } from "./loop-policy.mjs";
export function checkPullRequest(
  event,
  { root = process.cwd(), readPaths = readChangedFiles } = {},
) {
  const pr = event.pull_request;
  if (!pr) return { skipped: "non-PR event; process checks still run" };
  if (
    ["dependabot[bot]", "github-actions[bot]"].includes(pr.user?.login) &&
    pr.user?.type === "Bot"
  )
    return { skipped: "automation account" };
  const task = parseStateBlock(pr.body ?? "");
  const paths = readPaths({ baseSha: pr.base.sha, headSha: pr.head.sha, cwd: root });
  requireValue(task.branch === pr.head.ref, "Task branch differs from PR branch");
  return validateCheckpoint(task, { head: pr.head.sha, baseHead: pr.base.sha, paths, root });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireValue(process.env.GITHUB_EVENT_PATH, "GITHUB_EVENT_PATH is required");
    const result = checkPullRequest(
      JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
    );
    console.log(JSON.stringify({ status: "PASS", ...result }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
