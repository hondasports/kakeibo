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

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
// CommonMark link reference definition: optional ≤3-space indent, label,
// colon, destination (bare token or <...>), optional quoted/parenthesized
// title, end of line. A line with trailing unquoted text (e.g.
// `[todo]: fix the thing`) is NOT a definition — it renders as text and
// must be kept.
const LINK_REFERENCE_LINE_PATTERN =
  /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)(\s+("([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'|\(([^)\\\n]|\\.)*\)))?\s*$/;
const FENCE_MARKER_PATTERN = /^(`{3,}|~{3,})/;
const FENCE_CLOSER_PATTERN = /^(`{3,}|~{3,})\s*$/;

/**
 * Mask inline code spans (`` `...` ``) so stripping never touches text that
 * renders on GitHub. An opener backtick run pairs with the next run of the
 * exact same length; unclosed runs stay normal text, matching CommonMark.
 */
function maskInlineCode(text) {
  const runs = [];
  for (const match of text.matchAll(/`+/g)) {
    runs.push({ start: match.index, end: match.index + match[0].length });
  }
  const used = new Array(runs.length).fill(false);
  const spans = [];
  for (let i = 0; i < runs.length; i += 1) {
    if (used[i]) continue;
    const length = runs[i].end - runs[i].start;
    for (let j = i + 1; j < runs.length; j += 1) {
      if (used[j]) continue;
      if (runs[j].end - runs[j].start !== length) continue;
      spans.push([runs[i].start, runs[j].end]);
      // Backtick runs between the pair sit inside the code span and are
      // literal text; they must not pair again outside it.
      for (let k = i; k <= j; k += 1) used[k] = true;
      break;
    }
  }
  const saved = [];
  let masked = "";
  let last = 0;
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0])) {
    // NUL cannot appear in a GitHub body, so the sentinel never collides
    // with real content the way a space-padded marker could.
    masked += text.slice(last, start);
    masked += `\u0000${saved.length}\u0000`;
    saved.push(text.slice(start, end));
    last = end;
  }
  masked += text.slice(last);
  return { masked, saved };
}

/**
 * Remove markup that GitHub renders invisible: HTML comments (single- and
 * multi-line) and whole-line link reference definitions (`[label]: target`),
 * then collapse runs of 3+ blank lines (created by removal) down to 2.
 * Fenced code blocks and inline code are kept verbatim — markup inside them
 * is visible. Visible text is never removed.
 */
export function stripInvisibleMarkup(body) {
  const input = String(body ?? "");
  if (!input) return { body: input, strippedChars: 0 };

  // Split into verbatim (fenced code) and normal regions. Fences toggle on
  // lines whose trimmed content starts with 3+ of the same marker char.
  const lines = input.split("\n");
  const parts = [];
  let fence = null;
  let buffer = [];
  const pushBuffer = (kind) => {
    if (buffer.length === 0) return;
    parts.push({ kind, text: buffer.join("\n") });
    buffer = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      buffer.push(line);
      // A closer is marker chars only (plus trailing whitespace) — a line like
      // ```info inside a fence is content, not a close.
      const closer = trimmed.match(FENCE_CLOSER_PATTERN);
      if (closer && closer[1][0] === fence.char && closer[1].length >= fence.len) {
        pushBuffer("verbatim");
        fence = null;
      }
      continue;
    }
    // A backtick fence's info string may not itself contain backticks, but
    // treating any 3+-marker line as an opener is safe: it still stays verbatim.
    const opener = trimmed.match(FENCE_MARKER_PATTERN);
    if (opener) {
      pushBuffer("normal");
      buffer.push(line);
      fence = { char: opener[1][0], len: opener[1].length };
      continue;
    }
    buffer.push(line);
  }
  // A fence left open at EOF is a code block through end of document —
  // its content renders as literal code, so it stays verbatim.
  pushBuffer(fence ? "verbatim" : "normal");

  const stripped = parts.map((part) => {
    if (part.kind === "verbatim") return part.text;
    const { masked, saved } = maskInlineCode(part.text);
    let text = masked.replace(HTML_COMMENT_PATTERN, "");
    text = text
      .split("\n")
      .filter((line) => !LINK_REFERENCE_LINE_PATTERN.test(line))
      .join("\n");
    // Collapse 3+ consecutive blank (whitespace-only) lines to 2.
    const out = [];
    let blanks = 0;
    for (const line of text.split("\n")) {
      if (line.trim() === "") {
        blanks += 1;
        if (blanks > 2) continue;
      } else {
        blanks = 0;
      }
      out.push(line);
    }
    text = out.join("\n");
    for (let i = 0; i < saved.length; i += 1) {
      // Function replacement: saved spans may contain $&, $$, $', $`
      // which String.replace would otherwise interpret as substitution
      // patterns.
      text = text.replace(`\u0000${i}\u0000`, () => saved[i]);
    }
    return text;
  });

  const result = stripped.join("\n");
  return { body: result, strippedChars: input.length - result.length };
}

function toCommentSummary(comment) {
  const original = String(comment?.body ?? "");
  const normalized = stripInvisibleMarkup(original);
  // An empty original carries no markup — invisibleOnly means the body
  // was *entirely* invisible markup, not that it was absent.
  const invisibleOnly = original.trim() !== "" && normalized.body.trim() === "";
  const body = invisibleOnly ? "" : normalized.body;
  return {
    author: comment?.author?.login ?? null,
    url: comment?.url ?? null,
    createdAt: comment?.createdAt ?? null,
    updatedAt: comment?.updatedAt ?? null,
    bodyTruncated: body.length > FINDING_BODY_LIMIT,
    body: body.slice(0, FINDING_BODY_LIMIT),
    ...(normalized.strippedChars ? { strippedChars: normalized.strippedChars } : {}),
    ...(invisibleOnly ? { bodyInvisibleOnly: true } : {}),
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
      ...(firstComment.strippedChars ? { strippedChars: firstComment.strippedChars } : {}),
      ...(firstComment.bodyInvisibleOnly ? { bodyInvisibleOnly: true } : {}),
      replies: commentNodes.slice(1).map(toCommentSummary),
    });
  }

  // Eligibility (non-empty submitted review bodies) is decided on the ORIGINAL
  // body so stripping never changes which reviews are collected.
  const reviewFindings = reviews
    .filter((review) => String(review.body ?? "").trim() !== "")
    .map((review) => {
      const normalized = stripInvisibleMarkup(String(review.body ?? ""));
      const invisibleOnly = normalized.body.trim() === "";
      const body = invisibleOnly ? "" : normalized.body;
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
        ...(normalized.strippedChars ? { strippedChars: normalized.strippedChars } : {}),
        ...(invisibleOnly ? { bodyInvisibleOnly: true } : {}),
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
      ...(summary.strippedChars ? { strippedChars: summary.strippedChars } : {}),
      ...(summary.bodyInvisibleOnly ? { bodyInvisibleOnly: true } : {}),
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
    if (args[index] === "--") continue;
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
