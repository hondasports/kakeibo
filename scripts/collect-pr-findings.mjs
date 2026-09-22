import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FINDING_BODY_LIMIT = 1000;
const PAGE_SIZE = 100;
const THREAD_COMMENT_PAGE_SIZE = 20;

const THREADS_PAGE_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      title
      reviewThreads(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: ${THREAD_COMMENT_PAGE_SIZE}) {
            pageInfo { hasNextPage }
            nodes {
              author { login }
              body
              url
              createdAt
              updatedAt
            }
          }
        }
      }
    }
  }
}`;

const REVIEWS_PAGE_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          state
          body
          url
          submittedAt
          updatedAt
          author { login }
        }
      }
    }
  }
}`;

const ISSUE_COMMENTS_PAGE_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      comments(first: ${PAGE_SIZE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          body
          url
          createdAt
          updatedAt
          author { login }
        }
      }
    }
  }
}`;

const COLLECTION_SCOPE =
  "inline review threads (unresolved) + non-empty submitted review bodies (all states) + PR issue comments";

function toCommentSummary(comment) {
  const body = String(comment?.body ?? "");
  return {
    author: comment?.author?.login ?? null,
    url: comment?.url ?? null,
    createdAt: comment?.createdAt ?? null,
    updatedAt: comment?.updatedAt ?? null,
    bodyTruncated: body.length > FINDING_BODY_LIMIT,
    body: body.slice(0, FINDING_BODY_LIMIT),
  };
}

/**
 * Read a handled-findings record: lines of `<finding id> <updatedAt>` where the
 * version is the candidate's updatedAt at the time it was verified (a content
 * identifier, not a wall-clock timestamp). The version is required — an id-only
 * record could never expire and is rejected as invalid input. Handled records
 * apply only to reviews and issue comments; unresolved threads stay unhandled
 * until resolved on GitHub.
 */
export function parseHandledContent(content) {
  const handled = new Map();
  for (const line of String(content ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [id, updatedAt] = trimmed.split(/\s+/, 2);
    if (!updatedAt) {
      throw new Error(
        `handled記録の形式が不正です: "${trimmed}"（確認した候補の updatedAt を必ず付けてください）`,
      );
    }
    handled.set(id, updatedAt);
  }
  return handled;
}

export function readHandledFile(handledPath) {
  return parseHandledContent(readFileSync(handledPath, "utf8"));
}

function isUnhandled(finding, handled) {
  // A thread's own resolve state on GitHub is its handled marker: an unresolved
  // thread always counts as unhandled, since replies can be added or edited
  // without changing the first comment's version.
  if (finding.kind === "review_thread") return true;
  return handled.get(finding.id) !== finding.updatedAt;
}

/**
 * Fetch every page of a PR connection. Returns the full node list plus the last
 * seen pullRequest object (for top-level fields). Throws when the PR is missing
 * or a page fetch fails, so a partial collection is never reported as complete.
 */
export function fetchConnectionPages({ query, variables, select, execGraphql }) {
  const nodes = [];
  let after = null;
  let pullRequest = null;
  for (;;) {
    const data = execGraphql({ query, variables: { ...variables, after } });
    pullRequest = data?.repository?.pullRequest;
    if (!pullRequest) {
      throw new Error(
        `PR が見つかりません: ${variables.owner}/${variables.name}#${variables.number}`,
      );
    }
    const connection = select(pullRequest);
    nodes.push(...(connection?.nodes ?? []));
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return { nodes, pullRequest };
}

/**
 * Convert collected PR data into managed findings. The canonical finding id is
 * the GitHub node id, which never changes when other findings are resolved or
 * added; `seq` (f1..fn, ordered by first activity) is display-only.
 */
export function toFindings({ reviewThreads = [], reviews = [], comments = [], handled } = {}) {
  let resolvedThreadCount = 0;
  let outdatedThreadCount = 0;
  let truncatedCommentThreads = 0;

  const threadFindings = [];
  for (const thread of reviewThreads) {
    if (thread.isResolved) {
      resolvedThreadCount += 1;
      continue;
    }
    if (thread.isOutdated) outdatedThreadCount += 1;
    const commentsTruncated = Boolean(thread.comments?.pageInfo?.hasNextPage);
    if (commentsTruncated) truncatedCommentThreads += 1;
    const commentNodes = thread.comments?.nodes ?? [];
    const firstComment = toCommentSummary(commentNodes[0] ?? null);
    threadFindings.push({
      kind: "review_thread",
      id: thread.id,
      path: thread.path,
      line: thread.line,
      author: firstComment.author,
      url: firstComment.url,
      outdated: Boolean(thread.isOutdated),
      commentsTruncated,
      commentCount: commentNodes.length,
      createdAt: firstComment.createdAt,
      updatedAt: firstComment.updatedAt,
      bodyTruncated: firstComment.bodyTruncated,
      body: firstComment.body,
      replies: commentNodes.slice(1).map(toCommentSummary),
    });
  }

  const reviewFindings = reviews
    .filter((review) => String(review.body ?? "").trim() !== "")
    .map((review) => {
      const body = String(review.body ?? "");
      return {
        kind: "review",
        id: review.id,
        state: review.state,
        author: review.author?.login ?? null,
        url: review.url ?? null,
        createdAt: review.submittedAt ?? null,
        updatedAt: review.updatedAt ?? review.submittedAt ?? null,
        bodyTruncated: body.length > FINDING_BODY_LIMIT,
        body: body.slice(0, FINDING_BODY_LIMIT),
      };
    });

  const commentFindings = comments.map((comment) => {
    const summary = toCommentSummary(comment);
    return {
      kind: "issue_comment",
      id: comment.id,
      author: summary.author,
      url: summary.url,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      bodyTruncated: summary.bodyTruncated,
      body: summary.body,
    };
  });

  const findings = [...threadFindings, ...reviewFindings, ...commentFindings]
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))
    .map((finding, index) => ({ seq: `f${index + 1}`, ...finding }));

  const handledMap = handled ?? new Map();
  const unhandled = findings.filter((finding) => isUnhandled(finding, handledMap));

  return {
    scope: COLLECTION_SCOPE,
    pagesComplete: true,
    handledProvided: handled !== undefined,
    unresolvedThreadCount: threadFindings.length,
    resolvedThreadCount,
    outdatedThreadCount,
    reviewFindingCount: reviewFindings.length,
    issueCommentCount: commentFindings.length,
    truncatedCommentThreads,
    unhandledCount: unhandled.length,
    unhandled: unhandled.map((finding) => ({
      kind: finding.kind,
      id: finding.id,
      url: finding.url,
      author: finding.author,
      bodyTruncated: finding.bodyTruncated || undefined,
      commentsTruncated: finding.commentsTruncated || undefined,
    })),
    findings,
  };
}

function gh(args, { cwd } = {}) {
  return execFileSync("gh", args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function ghGraphql({ query, variables, cwd }) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue;
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
  }
  return JSON.parse(gh(args, { cwd })).data;
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

export function fetchPullRequestFindings({ owner, name, number, cwd, execGraphql } = {}) {
  const exec = execGraphql ?? (({ query, variables }) => ghGraphql({ query, variables, cwd }));
  const variables = { owner, name, number };
  const threadsPage = fetchConnectionPages({
    query: THREADS_PAGE_QUERY,
    variables,
    select: (pr) => pr.reviewThreads,
    execGraphql: exec,
  });
  const reviewsPage = fetchConnectionPages({
    query: REVIEWS_PAGE_QUERY,
    variables,
    select: (pr) => pr.reviews,
    execGraphql: exec,
  });
  const commentsPage = fetchConnectionPages({
    query: ISSUE_COMMENTS_PAGE_QUERY,
    variables,
    select: (pr) => pr.comments,
    execGraphql: exec,
  });
  return {
    pullRequest: threadsPage.pullRequest,
    reviewThreads: threadsPage.nodes,
    reviews: reviewsPage.nodes,
    comments: commentsPage.nodes,
  };
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
    } else if (args[index] === "--handled") {
      parsed.handled = args[index + 1];
      index += 1;
    } else {
      throw new Error(`未知の引数: ${args[index]}`);
    }
  }
  return parsed;
}

export function runCollectPrFindings({ pr, repo, cwd, execGraphql, handled } = {}) {
  const repository = resolveRepository({ repo, cwd });
  const number = resolvePullRequest({ pr, cwd });
  const { pullRequest, reviewThreads, reviews, comments } = fetchPullRequestFindings({
    ...repository,
    number,
    cwd,
    execGraphql,
  });
  const handledMap = handled === undefined ? undefined : readHandledFile(handled);
  const result = toFindings({ reviewThreads, reviews, comments, handled: handledMap });

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
