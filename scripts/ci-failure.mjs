/* CI failure extraction (#958): gh api経由で失敗checkのrun/job/artifact/logを
 * 取得し、{check,head,runUrl,artifactUrl,failedTests[{file,title}],reproduce} を
 * 生成する。reproduceはローカル再現コマンド。
 * 全ての外部呼び出しは注入可能（テストはmock gh/exec）。
 */
import { execFileSync } from "node:child_process";

const MAX_LOG_BYTES = 4 * 1024 * 1024;

/* check名 → E2E種別/Lint/Build/Unit/Process 分類（このrepoの実check名に合わせる） */
const CHECK_KIND = [
  [/^e2e\s*\((public|authenticated)\)/i, "e2e"],
  [/^e2e/i, "e2e"],
  [/^lint/i, "lint"],
  [/^build/i, "build"],
  [/^(test|unit|vitest)/i, "unit"],
  [/^(agent harness|process|test:process)/i, "process"],
];

/* `gh api repos/{}/actions/jobs/{id}/logs` は全行頭にISO timestampを付ける。
 * パース前に剥がす（行は `2026-10-07T23:06:34.7123456Z   <content>` 形）。 */
const GH_LOG_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/;
function stripLogPrefix(line) {
  return line.replace(GH_LOG_TS, "");
}

/* list reporterのtitle正規化:
 * - 実行中 `✘` 行は末尾に ` (5.2s)` 等のdurationが付く
 * - summary `N)` / flaky列挙は `────` paddingで右端まで埋まる
 * - error-mode headerは末尾に ` › <deepest failing step>` が付くことがある
 * - describe階層の ` › ` は playwright --grep が照合する titlePath.join(' ') と
 *   一致しないので空白へ変換する（再現コマンドが何も選択しない誤 not_reproduced 防止）
 */
export function normalizeTestTitle(title = "") {
  return title
    .replace(/\s*─+\s*$/, "")
    .replace(/\s*\(\d+(?:\.\d+)?s\)\s*$/, "")
    .replace(/\s*›\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkKind(checkName = "") {
  for (const [re, kind] of CHECK_KIND) if (re.test(checkName)) return kind;
  return "other";
}

/* statusCheckRollupエントリ → 失敗check名の一覧 */
export function failedCheckNames(rollup = []) {
  return (rollup ?? [])
    .filter((check) => {
      const name = check.name ?? check.context ?? "";
      if (!name) return false;
      const pending =
        (check.status && check.status !== "COMPLETED") ||
        (check.state && ["PENDING", "EXPECTED"].includes(check.state));
      const conclusion = check.conclusion ?? check.state ?? "";
      return !pending && !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion);
    })
    .map((check) => check.name ?? check.context);
}

/* Playwright list reporter の失敗/重複実行パターンと vitest FAIL 行から
 * {file,title} を抽出。e2e側は「N) [chromium] › path:line:col › title」、
 * vitest側は「FAIL  file.test.* > title」/「× file > title」。
 */
export function parseFailedTests(log = "") {
  const tests = [];
  const seen = new Set();
  const add = (file, title) => {
    const key = `${file}${title}`;
    if (!file || seen.has(key)) return;
    seen.add(key);
    tests.push({ file, title });
  };
  for (const raw of log.split("\n")) {
    const line = stripLogPrefix(raw);
    let m =
      /^\s*(?:\d+\)|✘\s+\d+|✘)\s*\[[^\]]+\]\s*›\s*(\S+\.spec\.ts):\d+:\d+\s*›\s*(.+?)\s*$/.exec(
        line,
      );
    if (m) {
      add(m[1], normalizeTestTitle(m[2]));
      continue;
    }
    m = /^\s*FAIL\s+(\S+\.test\.(?:ts|tsx|mjs|mts))\s*>\s*(.+?)\s*$/.exec(line);
    if (m) {
      add(m[1], normalizeTestTitle(m[2]));
      continue;
    }
  }
  return tests;
}

/* Playwright list reporter の flaky(=リトライで通過)抽出。実運用の正本は
 * playwright JSON report。ログからは最終summaryの `N flaky` セクション
 * だけを読む（1.63系のlist reporterは実行中に⚠行を出さない）。 */
export function parseFlakyTests(log = "") {
  const tests = [];
  const seen = new Set();
  let inFlakySection = false;
  for (const raw of log.split("\n")) {
    const line = stripLogPrefix(raw);
    // playwright最終summary: `  N flaky` の後に対象テストが列挙される
    if (/^\s*\d+\s+flaky/i.test(line)) {
      inFlakySection = true;
      continue;
    }
    if (inFlakySection && /^\s*\d+\s+(failed|passed|skipped|interrupted|did not run)/i.test(line)) {
      inFlakySection = false;
      continue;
    }
    if (!inFlakySection) continue;
    // セクション内の `[<project>] › file › title`（番号なし）
    const m = /^\s*\[[^\]]+\]\s*›\s*(\S+\.spec\.ts):\d+:\d+\s*›\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const title = normalizeTestTitle(m[2]);
    const key = `${m[1]}${title}`;
    if (!seen.has(key)) {
      seen.add(key);
      tests.push({ file: m[1], title });
    }
  }
  return tests;
}

/* AC2: 失敗種別ごとのローカル再現コマンド */
export function reproduceCommand({ checkName, failedTests = [] }) {
  const kind = checkKind(checkName);
  if (kind === "e2e" && failedTests.length) {
    return failedTests
      .map((t) => `pnpm run e2e:isolated -- ${t.file} --grep "${t.title.replace(/"/g, '\\"')}"`)
      .join(" && ");
  }
  if (kind === "unit" && failedTests.length) {
    return failedTests
      .map((t) => `pnpm exec vitest run ${t.file} -t "${t.title.replace(/"/g, '\\"')}"`)
      .join(" && ");
  }
  switch (kind) {
    case "lint":
      return "pnpm run lint";
    case "build":
      return "pnpm run build";
    case "process":
      return "pnpm run test:process";
    case "unit":
      // CIの Test ジョブが実行するのは test:coverage
      return "pnpm run test:coverage";
    case "e2e":
      return "pnpm run e2e:isolated";
    default:
      return null;
  }
}

/* check_runs API → job page URL → {runId, jobId} */
export function parseJobUrl(url = "") {
  const m = /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(url);
  if (!m) return {};
  return { runId: m[1], jobId: m[2] };
}

const ghApi = (gh, args, root) => gh(["api", ...args], root);

/**
 * 失敗check 1件を展開して ciFailure record を作る。
 * deps: { gh(args,root), root, slug } — ghは execFileSync("gh",...) 相当を注入。
 */
export function extractCiFailure({
  checkName,
  head,
  slug,
  root,
  gh = (args, r) =>
    execFileSync("gh", args, { cwd: r, encoding: "utf8", maxBuffer: MAX_LOG_BYTES }),
}) {
  const runsRaw = ghApi(gh, [`repos/${slug}/commits/${head}/check-runs?per_page=100`], root);
  const runs = JSON.parse(runsRaw.slice(runsRaw.indexOf("{")));
  const run = (runs.check_runs ?? []).find(
    (r) =>
      (r.name ?? "") === checkName &&
      r.conclusion &&
      !["success", "neutral", "skipped"].includes(r.conclusion),
  );
  const failure = {
    check: checkName,
    head,
    runUrl: null,
    artifactUrl: null,
    failedTests: [],
    reproduce: null,
  };
  if (!run) {
    failure.reproduce = reproduceCommand({ checkName, failedTests: [] });
    return failure;
  }
  failure.runUrl = run.html_url ?? null;
  const { runId, jobId } = parseJobUrl(run.html_url ?? "");
  if (runId) {
    try {
      const artsRaw = ghApi(
        gh,
        [`repos/${slug}/actions/runs/${runId}/artifacts?per_page=20`],
        root,
      );
      const arts = JSON.parse(artsRaw.slice(artsRaw.indexOf("{")));
      const art =
        (arts.artifacts ?? []).find((a) => /playwright|e2e|test/i.test(a.name ?? "")) ??
        arts.artifacts?.[0];
      if (art)
        failure.artifactUrl = `https://github.com/${slug}/actions/runs/${runId}/artifacts/${art.id}`;
    } catch {
      /* artifacts API失敗は致命ではない */
    }
  }
  if (jobId) {
    try {
      const log = ghApi(gh, [`repos/${slug}/actions/jobs/${jobId}/logs`], root);
      failure.failedTests = parseFailedTests(log);
    } catch {
      /* ログ取得失敗時はcheck名ベースのreproduceへフォールバック */
    }
  }
  failure.reproduce = reproduceCommand({ checkName, failedTests: failure.failedTests });
  return failure;
}

/** 全失敗checkをまとめて抽出（reproduce gate / --check-pr 出力用）。 */
export function extractCiFailures({ rollup, head, slug, root, gh }) {
  const names = failedCheckNames(rollup);
  return names.map((checkName) => extractCiFailure({ checkName, head, slug, root, gh }));
}

/* ci_failure イベントの reproduction 証跡バリデーション（AC3/AC4） */
export const REPRODUCTION_RESULTS = ["reproduced", "not_reproduced"];
export function validateReproduction(input) {
  const errors = [];
  if (typeof input !== "object" || input == null) return ["reproduction must be an object"];
  if (typeof input.command !== "string" || !input.command.trim())
    errors.push("reproduction.command required");
  if (!REPRODUCTION_RESULTS.includes(input.result))
    errors.push(`reproduction.result must be ${REPRODUCTION_RESULTS.join("|")}`);
  return errors;
}

/**
 * --check-pr用flaky診断（AC6）: 成功したE2E checkのjobログから
 * passed-on-retryのテストを拾う。失敗は呼び出し側で握りつぶす。
 */
export function ciFlakyDiagnostics({ rollup = [], head, slug, root, gh }) {
  const e2eChecks = new Set(
    (rollup ?? [])
      .map((c) => c.name ?? c.context ?? "")
      .filter((name) => name && checkKind(name) === "e2e"),
  );
  if (!e2eChecks.size || !head || !slug) return [];
  const raw = ghApi(gh, [`repos/${slug}/commits/${head}/check-runs?per_page=100`], root);
  const runs = JSON.parse(raw.slice(raw.indexOf("{")));
  const out = [];
  for (const run of runs.check_runs ?? []) {
    if (!e2eChecks.has(run.name)) continue;
    const { jobId } = parseJobUrl(run.html_url ?? "");
    if (!jobId) continue;
    try {
      const log = ghApi(gh, [`repos/${slug}/actions/jobs/${jobId}/logs`], root);
      for (const t of parseFlakyTests(log)) out.push({ check: run.name, ...t });
    } catch {
      /* このcheckのログ取得失敗は他checkを止めない */
    }
  }
  return out;
}

/** playwright JSON report → flaky(passed-on-retry)の {file,title} 一覧 */
export function flakyFromJsonReport(report) {
  const out = [];
  const walk = (suites = []) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        if (
          spec.ok === false &&
          spec.tests?.every((t) => t.status === "expected" || t.status === "skipped")
        )
          continue;
        for (const test of spec.tests ?? []) {
          if (test.status !== "flaky") continue;
          out.push({ file: spec.file ?? test.location?.file ?? "", title: spec.title ?? "" });
        }
      }
      walk(suite.suites ?? []);
    }
  };
  walk(report?.suites ?? []);
  return out;
}
