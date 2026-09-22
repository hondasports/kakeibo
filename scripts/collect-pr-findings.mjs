import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FINDING_BODY_LIMIT = 1000;
const REVIEW_THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      title
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes {
              author { login }
              body
              url
              createdAt
            }
          }
        }
      }
    }
  }
}`;

/**
 * Convert GraphQL reviewThread nodes into managed findings.
 * Unresolved threads become findings with stable ids (f1..fn, ordered by first
 * comment time). Resolved and outdated counts are reported for coverage checks.
 */
export function toFindings(reviewThreads) {
  const nodes = reviewThreads ?? [];
  const unresolved = nodes
    .filter((thread) => !thread.isResolved)
    .map((thread) => ({ thread, firstComment: thread.comments?.nodes?.[0] ?? null }))
    .sort((a, b) =>
      String(a.firstComment?.createdAt ?? "").localeCompare(
        String(b.firstComment?.createdAt ?? ""),
      ),
    );

  return {
    unresolvedCount: unresolved.length,
    resolvedCount: nodes.filter((thread) => thread.isResolved).length,
    outdatedCount: nodes.filter((thread) => thread.isOutdated).length,
    findings: unresolved.map(({ thread, firstComment }, index) => ({
      id: `f${index + 1}`,
      threadId: thread.id,
      path: thread.path,
      line: thread.line,
      author: firstComment?.author?.login ?? null,
      url: firstComment?.url ?? null,
      outdated: Boolean(thread.isOutdated),
      commentCount: thread.comments?.nodes?.length ?? 0,
      body: String(firstComment?.body ?? "").slice(0, FINDING_BODY_LIMIT),
    })),
  };
}

function gh(args, { cwd } = {}) {
  return execFileSync("gh", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

export function resolveRepository({ repo, cwd } = {}) {
  if (repo) {
    const [owner, name] = String(repo).split("/");
    if (!owner || !name) throw new Error(`--repo は owner/name 形式で指定してください: ${repo}`);
    return { owner, name };
  }
  const parsed = JSON.parse(gh(["repo", "view", "--json", "owner,name"], { cwd }));
  return { owner: parsed.owner?.login, name: parsed.name };
}

export function resolvePullRequest({ pr, cwd } = {}) {
  if (pr) return Number(pr);
  const parsed = JSON.parse(gh(["pr", "view", "--json", "number"], { cwd }));
  if (!parsed.number)
    throw new Error("現在のbranchに紐付くPRが見つかりません。--pr を指定してください");
  return parsed.number;
}

export function fetchReviewThreads({ owner, name, number, cwd } = {}) {
  const output = gh(
    [
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${number}`,
    ],
    { cwd },
  );
  const parsed = JSON.parse(output);
  const pullRequest = parsed?.data?.repository?.pullRequest;
  if (!pullRequest) {
    throw new Error(`PR が見つかりません: ${owner}/${name}#${number}`);
  }
  return pullRequest;
}

export function parseArguments(args) {
  const parsed = { cwd: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--pr") {
      parsed.pr = args[index + 1];
      index += 1;
    } else if (args[index] === "--repo") {
      parsed.repo = args[index + 1];
      index += 1;
    } else {
      throw new Error(`未知の引数: ${args[index]}`);
    }
  }
  return parsed;
}

export function runCollectPrFindings({ pr, repo, cwd } = {}) {
  const repository = resolveRepository({ repo, cwd });
  const number = resolvePullRequest({ pr, cwd });
  const pullRequest = fetchReviewThreads({ ...repository, number, cwd });
  const result = toFindings(pullRequest.reviewThreads?.nodes);

  const report = {
    repo: `${repository.owner}/${repository.name}`,
    pr: pullRequest.number,
    prUrl: pullRequest.url,
    title: pullRequest.title,
    ...result,
  };

  console.log("PR_FINDINGS status: PASS");
  console.log(JSON.stringify(report, null, 2));
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCollectPrFindings(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.log("PR_FINDINGS status: FAIL");
    console.log(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
