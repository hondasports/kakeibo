import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productUpdateDrafts } from "../src/content/product-updates.ts";
import { filterUnpublishedPullRequests } from "../src/lib/generateProductUpdates.ts";
import {
  classifyCommitSubjects,
  collectPullRequestDecisions,
  isIntegrationHeadRef,
  resolveReleaseBoundary,
  type ParsedPullRequestRef,
  type SourcePullRequestRecord,
} from "../src/lib/releaseSourcePullRequests.ts";
import {
  compareVersionStrings,
  mergeGeneratedAndManualDrafts,
  mergeProductUpdates,
  ProductUpdate,
  ProductUpdateValidationError,
  validateAppVersion,
  validateProductionProductUpdates,
  type ProductionProductUpdates,
  type PullRequestDecision,
} from "../lib/domain/productUpdates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ProductUpdateValidationError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseRepoSlug(): { owner: string; repo: string } {
  const full = process.env.GITHUB_REPOSITORY ?? "hondasports/kakeibo";
  const [owner, repo] = full.split("/");
  if (!owner || !repo) {
    throw new ProductUpdateValidationError(`Invalid GITHUB_REPOSITORY: ${full}`);
  }
  return { owner, repo };
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "suzumemo-release-script",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProductUpdateValidationError(
      `GitHub API request failed: ${response.status} ${response.statusText} for ${url}\n${body}`,
    );
  }

  return response.json() as Promise<T>;
}

async function downloadAssetText(assetId: number, token: string): Promise<string> {
  const { owner, repo } = parseRepoSlug();
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetId}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "suzumemo-release-script",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProductUpdateValidationError(
      `GitHub asset download failed: ${response.status} ${response.statusText} for ${url}\n${body}`,
    );
  }

  return response.text();
}

function gitText(args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function revParseCommit(ref: string): string | undefined {
  try {
    const resolved = gitText(["rev-parse", "--verify", `${ref}^{commit}`]);
    return COMMIT_SHA_PATTERN.test(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function mergeBaseSha(a: string, b: string): string | undefined {
  try {
    const resolved = gitText(["merge-base", a, b]);
    return COMMIT_SHA_PATTERN.test(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function commitTimestamp(sha: string): string {
  return new Date(gitText(["show", "-s", "--format=%cI", sha]))
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

function logCommits(range: string): Array<{ sha: string; subject: string }> {
  const output = execFileSync("git", ["log", "--format=%H%x00%s", range], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\n")
    .map((line) => {
      const [sha, subject] = line.split("\0");
      return { sha: sha?.trim() ?? "", subject: subject ?? "" };
    })
    .filter((entry) => entry.sha !== "");
}

/**
 * Resolve SOURCE_REF to a commit SHA. Resolution failure is an error, never a fallback.
 * `actions/checkout` leaves only remote-tracking refs for branch names, so `main` is
 * also tried as `origin/main` and, finally, the checked-out HEAD (the same commit the
 * release job checks out for SOURCE_REF).
 */
function resolveSourceSha(): string | undefined {
  const sourceRef = process.env.SOURCE_REF;
  if (!sourceRef) {
    return undefined;
  }
  const candidates = [sourceRef, `origin/${sourceRef}`, "HEAD"];
  for (const candidate of candidates) {
    const sha = revParseCommit(candidate);
    if (sha) {
      return sha;
    }
  }
  throw new ProductUpdateValidationError(`SOURCE_REF をコミットSHAへ解決できません: ${sourceRef}`);
}

type GitHubRelease = {
  tag_name: string;
  created_at: string;
  published_at: string;
  target_commitish: string;
  assets: Array<{ id: number; name: string }>;
};

async function fetchPullRequest(number: number, token: string): Promise<SourcePullRequestRecord> {
  const { owner, repo } = parseRepoSlug();
  const pull = await fetchJson<{
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    base: { ref: string };
    head: { ref: string };
    user: { type: string };
  }>(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, token);

  return {
    number: pull.number,
    title: pull.title,
    body: pull.body,
    mergedAt: pull.merged_at,
    baseRef: pull.base.ref,
    headRef: pull.head.ref,
    authorType: pull.user.type,
  };
}

/** Map a commit to the merged PR numbers that introduced it (GitHub-tracked association). */
async function fetchMergedPullsForCommit(sha: string, token: string): Promise<number[]> {
  const { owner, repo } = parseRepoSlug();
  const pulls = await fetchJson<Array<{ number: number; merged_at: string | null }>>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`,
    token,
  );
  return pulls
    .filter((pull) => pull.merged_at !== null)
    .map((pull) => pull.number)
    .filter((number) => Number.isSafeInteger(number) && number > 0);
}

async function loadPastUpdates({
  appVersion,
  token,
}: {
  appVersion: string;
  token: string;
}): Promise<{
  pastUpdates: ProductUpdate[];
  latestRelease?: GitHubRelease;
  previousSourceSha?: string;
}> {
  const { owner, repo } = parseRepoSlug();
  const releases = await fetchJson<GitHubRelease[]>(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`,
    token,
  );

  const pastUpdates: ProductUpdate[] = [];
  const seenIds = new Map<string, string>();
  let latestRelease: GitHubRelease | undefined;
  let latestReleasePayload: ProductionProductUpdates | undefined;

  for (const release of releases) {
    if (!release.tag_name.startsWith("app-v")) {
      continue;
    }

    const releaseVersion = release.tag_name.slice("app-v".length);
    if (releaseVersion === appVersion) {
      continue;
    }

    validateAppVersion(releaseVersion);

    if (
      !latestRelease ||
      compareVersionStrings(releaseVersion, latestRelease.tag_name.slice("app-v".length)) < 0
    ) {
      latestRelease = release;
    }

    const asset = release.assets.find((a) => a.name === "product-updates.json");
    if (!asset) {
      throw new ProductUpdateValidationError(
        `Release ${release.tag_name} does not have a product-updates.json asset`,
      );
    }

    const text = await downloadAssetText(asset.id, token);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProductUpdateValidationError(
        `Release ${release.tag_name} product-updates.json is not valid JSON`,
      );
    }

    validateProductionProductUpdates(payload);

    if (latestRelease?.tag_name === release.tag_name) {
      latestReleasePayload = payload;
    }

    if (payload.version !== releaseVersion) {
      throw new ProductUpdateValidationError(
        `Release ${release.tag_name} version does not match asset version ${payload.version}`,
      );
    }

    for (const update of payload.updates) {
      const previousVersion = seenIds.get(update.id);
      if (previousVersion) {
        throw new ProductUpdateValidationError(
          `ProductUpdate id ${update.id} is duplicated across releases (${previousVersion} and ${update.version})`,
        );
      }
      seenIds.set(update.id, update.version);
      pastUpdates.push(update);
    }
  }

  return { pastUpdates, latestRelease, previousSourceSha: latestReleasePayload?.sourceSha };
}

function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function main(): Promise<void> {
  const appVersion = getRequiredEnv("APP_VERSION");
  const publishedAt = getRequiredEnv("PUBLISHED_AT");
  const token = getRequiredEnv("GITHUB_TOKEN");

  validateAppVersion(appVersion);

  if (!PUBLISHED_AT_PATTERN.test(publishedAt)) {
    throw new ProductUpdateValidationError(`Invalid PUBLISHED_AT: ${publishedAt}`);
  }

  const { pastUpdates, latestRelease, previousSourceSha } = await loadPastUpdates({
    appVersion,
    token,
  });

  const sourceRef = process.env.SOURCE_REF;
  const sourceSha = resolveSourceSha();
  const sourceMergedAt = sourceSha ? commitTimestamp(sourceSha) : undefined;

  const decisions: PullRequestDecision[] = [];
  const generatedDrafts: typeof productUpdateDrafts = [];
  let collectionStatus: "collected" | "no_source_ref" | "initial_release" = "no_source_ref";
  let boundaryNote: string | undefined;

  if (sourceSha) {
    const boundary = resolveReleaseBoundary({
      previousSourceSha,
      latestReleaseTag: latestRelease?.tag_name,
      sourceSha,
      revParse: revParseCommit,
      mergeBase: mergeBaseSha,
    });
    if (boundary.kind === "error") {
      throw new ProductUpdateValidationError(boundary.reason);
    }
    if (boundary.kind === "initial_release") {
      collectionStatus = "initial_release";
      boundaryNote = "過去の app-v リリースがないため初回リリースとして扱います";
    } else {
      collectionStatus = "collected";
      boundaryNote = boundary.note;

      const commits = logCommits(`${boundary.boundarySha}..${sourceSha}`);
      const classified = classifyCommitSubjects(commits);

      const refsByNumber = new Map<number, ParsedPullRequestRef>();
      const unresolvedCommits: Array<{ sha: string; subject: string }> = [];
      for (const commit of classified) {
        if (commit.kind === "pull_request") {
          if (!refsByNumber.has(commit.number)) {
            refsByNumber.set(commit.number, {
              number: commit.number,
              headRef: commit.headRef,
            });
          }
        } else if (commit.kind === "unresolved") {
          unresolvedCommits.push(commit);
        }
      }

      const collectionErrors: string[] = [];
      for (const commit of unresolvedCommits) {
        const associated = await fetchMergedPullsForCommit(commit.sha, token);
        if (associated.length === 0) {
          collectionErrors.push(
            `コミット ${commit.sha.slice(0, 7)} (${commit.subject}) に紐付くマージ済みPRが見つかりません`,
          );
          continue;
        }
        for (const number of associated) {
          if (!refsByNumber.has(number)) {
            refsByNumber.set(number, { number });
          }
        }
      }
      if (collectionErrors.length > 0) {
        throw new ProductUpdateValidationError(
          `リリース範囲内にPRへ紐付けできないコミットがあります:\n${collectionErrors.join("\n")}`,
        );
      }

      const refs = [...refsByNumber.values()];
      const fetchTargets = refs.filter((ref) => !isIntegrationHeadRef(ref.headRef));

      const records: SourcePullRequestRecord[] = [];
      for (const ref of fetchTargets) {
        records.push(await fetchPullRequest(ref.number, token));
      }

      const unpublished = new Set(
        filterUnpublishedPullRequests(records, pastUpdates).map((record) => record.number),
      );
      const collected = collectPullRequestDecisions(refs, records, unpublished);
      decisions.push(...collected.decisions);
      generatedDrafts.push(...collected.drafts);
      if (collected.errors.length > 0) {
        throw new ProductUpdateValidationError(
          `リリース範囲内のPRの更新履歴欄に問題があります:\n${collected.errors.join("\n")}`,
        );
      }
    }
  }

  const mergedDrafts = mergeGeneratedAndManualDrafts({
    generated: generatedDrafts,
    manual: productUpdateDrafts,
  });

  const { allUpdates, currentUpdates } = mergeProductUpdates({
    pastUpdates,
    drafts: mergedDrafts,
    appVersion,
    publishedAt,
  });

  const generatedPath = resolve(repoRoot, "src/generated/product-updates.json");
  writeJsonFile(generatedPath, allUpdates);

  const currentReleasePath = resolve(repoRoot, ".tmp/product-updates.current-release.json");
  writeJsonFile(currentReleasePath, {
    version: appVersion,
    publishedAt,
    ...(sourceRef && sourceSha && sourceMergedAt ? { sourceRef, sourceSha, sourceMergedAt } : {}),
    pullRequestDecisions: [...decisions].sort((a, b) => a.pullRequest - b.pullRequest),
    updates: currentUpdates,
  });

  printGenerationSummary({
    decisions,
    updates: currentUpdates,
    manualCount: productUpdateDrafts.length,
    collectionStatus,
    boundaryNote,
  });

  console.log(`Generated ${generatedPath}`);
  console.log(`Generated ${currentReleasePath}`);
  console.log(`Total updates: ${allUpdates.length}`);
  console.log(`Current release updates: ${currentUpdates.length}`);
}

type SummaryInput = {
  decisions: PullRequestDecision[];
  updates: Array<{ id: string; title: string }>;
  manualCount: number;
  collectionStatus: "collected" | "no_source_ref" | "initial_release";
  boundaryNote?: string;
};

const OUTCOME_LABEL: Record<PullRequestDecision["outcome"], string> = {
  published: "掲載",
  skipped: "非掲載",
  exempt_bot: "対象外(bot)",
  integration: "対象外(統合PR)",
  not_merged: "対象外(未マージ)",
};

function printGenerationSummary({
  decisions,
  updates,
  manualCount,
  collectionStatus,
  boundaryNote,
}: SummaryInput): void {
  const publishedCount = decisions.filter((d) => d.outcome === "published").length;
  const statusLabel = {
    collected: "collected",
    no_source_ref: "skipped (SOURCE_REF 未設定)",
    initial_release: "initial release (境界なし)",
  }[collectionStatus];

  const lines = [
    "## Product update generation",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Collection | ${statusLabel} |`,
    `| In-range pull requests | ${decisions.length} |`,
    `| Published product updates | ${publishedCount} |`,
    `| Manual drafts | ${manualCount} |`,
    `| Updates in this release | ${updates.length} |`,
    "",
  ];

  if (boundaryNote) {
    lines.push(`Boundary: ${boundaryNote}`, "");
  }

  if (collectionStatus === "no_source_ref") {
    lines.push(
      "SOURCE_REF が未設定のため元PR収集を行いませんでした。手動ドラフトのみが対象です。",
      "",
    );
  }

  if (decisions.length > 0) {
    lines.push("| PR | Outcome | Detail |", "| --- | --- | --- |");
    for (const decision of [...decisions].sort((a, b) => a.pullRequest - b.pullRequest)) {
      const detail = decision.updateId
        ? `${decision.reason} → ${decision.updateId}`
        : decision.reason;
      lines.push(`| #${decision.pullRequest} | ${OUTCOME_LABEL[decision.outcome]} | ${detail} |`);
    }
    lines.push("");
  }

  if (updates.length === 0) {
    lines.push(
      "今回のリリースで掲載される更新履歴はありません。上記の対象PRと理由を確認してください。",
      "",
    );
  } else {
    lines.push("### 掲載予定の更新履歴", "");
    for (const update of updates) {
      lines.push(`- ${update.id}: ${update.title}`);
    }
    lines.push("");
  }

  const summary = `${lines.join("\n")}\n`;
  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
