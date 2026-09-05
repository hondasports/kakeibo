import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productUpdateDrafts } from "../src/content/product-updates.ts";
import {
  fetchMergedPullRequests,
  filterUnpublishedPullRequests,
  generateProductUpdateCandidates,
  toProductUpdateDrafts,
  type ProductUpdateGenerationStatus,
} from "../src/lib/generateProductUpdates.ts";
import {
  compareVersionStrings,
  mergeGeneratedAndManualDrafts,
  mergeProductUpdates,
  ProductUpdate,
  ProductUpdateValidationError,
  resolveProductUpdateSourceAt,
  validateAppVersion,
  validateProductionProductUpdates,
  type ProductionProductUpdates,
} from "../src/lib/productUpdates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

const SAFE_REF_PATTERN = /^[A-Za-z0-9._/:-]+$/;

function resolveSourceRef(): string | undefined {
  const sourceRef = process.env.SOURCE_REF;
  if (!sourceRef) return undefined;
  if (sourceRef.startsWith("-") || !SAFE_REF_PATTERN.test(sourceRef)) {
    throw new ProductUpdateValidationError(`Invalid SOURCE_REF: ${sourceRef}`);
  }
  try {
    return execFileSync("git", ["rev-parse", "--", sourceRef], { encoding: "utf8" }).trim();
  } catch {
    return sourceRef;
  }
}

function normalizeTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "Z");
}

type SourcePullRequest = {
  mergedAt: string;
  searchBase: string;
};

function resolveSearchBase(headRef: string, fallbackBase: string): string {
  if (headRef === "preview" || headRef.startsWith("release/")) {
    return headRef;
  }
  return fallbackBase;
}

async function fetchSourcePullRequest(
  sourceSha: string,
  fallbackBase: string,
  token: string,
): Promise<SourcePullRequest | undefined> {
  const { owner, repo } = parseRepoSlug();

  const pullsResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sourceSha}/pulls?per_page=10`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "suzumemo-release-script",
      },
    },
  );

  if (pullsResponse.ok) {
    const pulls = (await pullsResponse.json()) as Array<{
      merged_at: string | null;
      base: { ref: string };
      head: { ref: string };
    }>;
    const mergedPulls = pulls
      .filter((p): p is typeof p & { merged_at: string } => p.merged_at !== null)
      .sort((a, b) => b.merged_at.localeCompare(a.merged_at));
    if (mergedPulls.length > 0) {
      const latest = mergedPulls[0];
      return {
        mergedAt: normalizeTimestamp(latest.merged_at),
        searchBase: resolveSearchBase(latest.head.ref, fallbackBase),
      };
    }
  }

  try {
    const commit = await fetchJson<{ commit: { committer: { date: string } } }>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sourceSha}`,
      token,
    );
    return {
      mergedAt: normalizeTimestamp(commit.commit.committer.date),
      searchBase: fallbackBase,
    };
  } catch {
    return undefined;
  }
}

type GitHubRelease = {
  tag_name: string;
  created_at: string;
  published_at: string;
  target_commitish: string;
  assets: Array<{ id: number; name: string }>;
};

async function fetchCommitTime(commitSha: string, token: string): Promise<string | undefined> {
  const { owner, repo } = parseRepoSlug();
  try {
    const commit = await fetchJson<{ commit: { committer: { date: string } } }>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`,
      token,
    );
    return normalizeTimestamp(commit.commit.committer.date);
  } catch {
    return undefined;
  }
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
  latestReleaseSourceAt?: string;
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
  let latestReleaseHasUpdates: GitHubRelease | undefined;

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

    if (
      payload.updates.length > 0 &&
      (!latestReleaseHasUpdates ||
        compareVersionStrings(
          releaseVersion,
          latestReleaseHasUpdates.tag_name.slice("app-v".length),
        ) < 0)
    ) {
      latestReleaseHasUpdates = release;
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

  const legacySourceAt =
    latestReleasePayload?.sourceRef && latestReleasePayload.sourceMergedAt
      ? undefined
      : latestReleaseHasUpdates
        ? ((await fetchCommitTime(`tags/${latestReleaseHasUpdates.tag_name}`, token)) ??
          latestReleaseHasUpdates.published_at)
        : undefined;
  const latestReleaseSourceAt = resolveProductUpdateSourceAt(latestReleasePayload, legacySourceAt);

  return { pastUpdates, latestRelease, latestReleaseSourceAt };
}

function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function main(): Promise<void> {
  const appVersion = getRequiredEnv("APP_VERSION");
  const publishedAt = getRequiredEnv("PUBLISHED_AT");
  const token = getRequiredEnv("GITHUB_TOKEN");
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const base = process.env.BASE_REF || "main";

  validateAppVersion(appVersion);

  if (!PUBLISHED_AT_PATTERN.test(publishedAt)) {
    throw new ProductUpdateValidationError(`Invalid PUBLISHED_AT: ${publishedAt}`);
  }

  const { pastUpdates, latestRelease, latestReleaseSourceAt } = await loadPastUpdates({
    appVersion,
    token,
  });
  const { owner, repo } = parseRepoSlug();

  const sourceSha = resolveSourceRef();
  const sourcePullRequest = sourceSha
    ? await fetchSourcePullRequest(sourceSha, base, token)
    : undefined;
  const searchBase = sourcePullRequest?.searchBase ?? base;
  const before = sourcePullRequest?.mergedAt;
  const processedSourceAt =
    before ?? (sourceSha ? await fetchCommitTime(sourceSha, token) : undefined);
  const sourceRef = process.env.SOURCE_REF;

  const fetchedPulls = await fetchMergedPullRequests({
    owner,
    repo,
    base: searchBase,
    since: latestReleaseSourceAt ?? latestRelease?.published_at,
    before,
    token,
  });
  const pulls = filterUnpublishedPullRequests(fetchedPulls, pastUpdates);

  const generationResult = await generateProductUpdateCandidates(pulls, {
    apiKey: openaiApiKey,
  });
  const generatedCandidates = toProductUpdateDrafts(generationResult.decisions);

  const mergedDrafts = mergeGeneratedAndManualDrafts({
    generated: generatedCandidates,
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
    ...(sourceRef && processedSourceAt ? { sourceRef, sourceMergedAt: processedSourceAt } : {}),
    updates: currentUpdates,
  });

  printGenerationSummary({
    pulls,
    decisions: generationResult.decisions,
    candidates: generatedCandidates,
    manualCount: productUpdateDrafts.length,
    status: generationResult.status,
  });

  console.log(`Generated ${generatedPath}`);
  console.log(`Generated ${currentReleasePath}`);
  console.log(`Total updates: ${allUpdates.length}`);
  console.log(`Current release updates: ${currentUpdates.length}`);
  console.log(`Generated drafts from ${pulls.length} pull requests`);
}

type SummaryInput = {
  pulls: Array<{ number: number }>;
  decisions: Array<{
    sourcePullRequestNumbers: number[];
    publish: boolean;
    reason: string;
  }>;
  candidates: Array<{ id: string }>;
  manualCount: number;
  status: ProductUpdateGenerationStatus;
};

function printGenerationSummary({
  pulls,
  decisions,
  candidates,
  manualCount,
  status,
}: SummaryInput): void {
  const publishedCount = candidates.length;
  const skippedCount = decisions.length - publishedCount;
  const statusLabel = {
    success: "success",
    skipped_no_api_key: "skipped (no API key)",
    skipped_no_prs: "skipped (no PRs)",
    failed_api: "failed (OpenAI API)",
    failed_json: "failed (response format)",
    failed_validation: "failed (validation)",
  } satisfies Record<ProductUpdateGenerationStatus, string>;

  const details: string[] = [];
  if (status === "skipped_no_prs") {
    details.push("No merged pull requests found.");
  } else if (status === "skipped_no_api_key") {
    details.push("Product update generation warning: skipped (no API key).");
    details.push(
      "automatic product updates were not added; existing and manual updates were retained.",
    );
    details.push("OPENAI_API_KEY is not set; using manual drafts only.");
  } else if (status !== "success") {
    details.push(`Product update generation warning: ${statusLabel[status]}.`);
    details.push(
      "automatic product updates were not added; existing and manual updates were retained.",
    );
  } else {
    let candidateIndex = 0;
    for (const decision of decisions) {
      const numbers = [...decision.sourcePullRequestNumbers].sort((a, b) => a - b);
      const prLabels = numbers.map((n) => `#${n}`).join(", ");
      if (decision.publish) {
        const candidate = candidates[candidateIndex++];
        details.push(`PR ${prLabels} → published as ${candidate?.id ?? "unknown"}`);
      } else {
        details.push(`PR ${prLabels} → skipped: ${decision.reason}`);
      }
    }
  }

  const lines = [
    "## Product update generation",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Target PRs | ${pulls.length} |`,
    `| Published product updates | ${publishedCount} |`,
    `| Skipped PRs | ${skippedCount} |`,
    `| Manual drafts | ${manualCount} |`,
    `| OpenAI generation status | ${statusLabel[status]} |`,
    "",
    ...details,
  ];

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
