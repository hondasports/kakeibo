import { afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  acceptanceCriteriaHash,
  aftercareFetchers,
  artifactManifest,
  buildReviewPacket,
  cliCommandName,
  cliMain,
  collectFindingsArgs,
  compactTaskForExport,
  hydrateExportedTask,
  inspectPullRequest,
  loadTask,
  metricsPath,
  parseArguments,
  parseStateBlock,
  refreshTask,
  repositorySlugFromRemoteUrl,
  resolveCiFailures,
  resolveLoopStep,
  resolveRepositorySlug,
  restoreTask,
  run,
  runRequiredVerification,
  runVerification,
  saveTask,
  stateBlock,
  summarizeTask,
  taskPath,
  transitionTask,
  watchAftercare,
} from "../loop-runner.mjs";
import {
  agentAssessment,
  reviewFixture,
  taskFixture,
  verificationManifestFixture,
} from "../loop-test-fixtures.mjs";
import {
  computeAssessment,
  currentEvidence,
  requiredVerificationKinds,
  verificationSummary,
} from "../loop-policy.mjs";
import path from "node:path";
const root = process.cwd();
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
let template = null;
afterAll(() => {
  if (template) rmSync(template, { recursive: true, force: true });
});
const gitIn =
  (dir) =>
  (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
/**
 * Every test starts from the same committed fixture repository. Building it
 * once and copying the directory (a plain repo stores no absolute paths)
 * replaces seven git spawns per test with one filesystem copy.
 */
/** Records an earlier review must carry to serve as an incremental-review base. */
const eligibleReview = (task) => ({
  independent: true,
  risk: "T3",
  acHash: acceptanceCriteriaHash(task.spec),
});
/** #958: ci_failure遷移に必須のexit（reason+ciFailure+reproduction）のfixture。 */
const ciFailureExit = (overrides = {}) => ({
  reason: "CI failed",
  ciFailure: {
    check: "E2E (Playwright / Chromium / authenticated)",
    head: "a".repeat(40),
    runUrl: "https://github.com/o/r/actions/runs/1",
    artifactUrl: "https://github.com/o/r/actions/runs/1/artifacts/2",
    failedTests: [{ file: "e2e/receipt.spec.ts", title: "fails" }],
    reproduce: "pnpm exec playwright test e2e/receipt.spec.ts --project=authenticated",
  },
  reproduction: {
    command: "pnpm exec playwright test e2e/receipt.spec.ts --project=authenticated",
    result: "reproduced",
    note: "same failure locally",
  },
  ...overrides,
});
function repository() {
  template ??= buildTemplateRepository();
  const dir = mkdtempSync(path.join(tmpdir(), "loop-test-"));
  dirs.push(dir);
  cpSync(template, dir, { recursive: true });
  const git = gitIn(dir);
  const baseHead = git("rev-parse", "HEAD");
  const task = taskFixture(dir, { head: baseHead, baseHead, baseRef: "preview" });
  return { dir, git, task };
}
function buildTemplateRepository() {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-template-"));
  cpSync(path.join(root, ".agent"), path.join(dir, ".agent"), { recursive: true });
  const git = gitIn(dir);
  mkdirSync(path.join(dir, "scripts"));
  cpSync(
    path.join(root, "scripts/check-task-worktree.mjs"),
    path.join(dir, "scripts/check-task-worktree.mjs"),
  );
  writeFileSync(path.join(dir, "scripts/check-loop-docs.mjs"), "process.exit(0);\n");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ scripts: { "test:process": 'node -e "process.exit(0)"' } }),
  );
  // pnpm run generates node_modules/ + pnpm-lock.yaml at runtime; the fixture
  // ignores them like a real repo would so verification keeps the tree clean.
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\npnpm-lock.yaml\n");
  git("init", "-b", "preview");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("add", ".");
  git("-c", "core.hooksPath=/dev/null", "commit", "-m", "base");
  git("switch", "-c", "codex/task");
  return dir;
}

describe("persistent task gates", () => {
  const delivery = (task, overrides = {}) => ({
    number: 7,
    state: "OPEN",
    isDraft: false,
    headRefOid: task.head,
    baseRefOid: task.baseHead,
    baseRefName: "preview",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    statusCheckRollup: ["Agent harness", "CI scope", "Lint", "Build", "Test"].map((name) => ({
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
    })),
    ...overrides,
  });
  const completeFindings = { pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 };
  // The gate only sees the verify:prepush success marker file
  // for the current HEAD (the runner never records the result itself).
  const markPrepush = (dir, head) => {
    const marker = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", `agent-prepush/${head}.ok`],
      { cwd: dir, encoding: "utf8" },
    ).trim();
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, "ok\n");
  };
  it.each([
    ["aftercare", false],
    ["aftercare", true],
    ["done", false],
    ["done", true],
  ])("observes annotated-tag bases in %s and rejects moved tags (watch=%s)", (state, watch) => {
    const { dir, git, task } = repository();
    git("tag", "-a", "baseline", "-m", "original base", task.baseHead);
    expect(git("rev-parse", "baseline")).not.toBe(task.baseHead);
    task.baseRef = "baseline";
    task.state = state;
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    const services = {
      fetchPr: () => delivery(task),
      fetchFindings: () => completeFindings,
      sleep: () => {
        throw new Error("A valid checkpoint should return without waiting");
      },
    };
    const args = { "check-pr": "7", ...(watch ? { "watch-aftercare": true } : {}) };
    const observeDirect = () =>
      watch
        ? watchAftercare(task, "7", dir, { ...services, readOnly: true })
        : inspectPullRequest(task, "7", undefined, dir, services).evidence;
    expect(run(args, dir, services)).toMatchObject({ ready: true });
    expect(observeDirect()).toMatchObject({ ready: true });
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    const movedBase = git(
      "commit-tree",
      git("rev-parse", "HEAD^{tree}"),
      "-p",
      task.baseHead,
      "-m",
      "changed base",
    );
    git("tag", "-f", "-a", "baseline", "-m", "moved base", movedBase);
    expect(git("rev-parse", "HEAD")).toBe(task.head);
    expect(() => run(args, dir, services)).toThrow("Agent state does not match PR HEAD/base");
    expect(observeDirect).toThrow("Agent state does not match PR HEAD/base");
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
  });
  it.each([
    ["aftercare", false],
    ["aftercare", true],
    ["done", false],
    ["done", true],
  ])("uses actual runtime CI requirements for %s observation (watch=%s)", (state, watch) => {
    const { dir, git, task } = repository();
    const cached = structuredClone(task.assessment);
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src/app.ts"), "export const app = true;\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "runtime change");
    task.head = git("rev-parse", "HEAD");
    task.state = state;
    // root省略だとcwd(=実行repo)の `preview` ブランチ有無でfail-closed T3/T1が
    // 環境依存になる（CIのcheckoutにはlocal previewが無い）。fixture repoを渡す。
    const actual = computeAssessment(task, ["src/app.ts"], dir);
    expect(actual.runtimeRelevant).toBe(true);
    expect(actual.verification.e2e).toBe(true);
    task.risk = actual.risk.final;
    for (const kind of ["process", "lint", "unit", "build"])
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    // Phase 1: the always-required CI gate set is incomplete → not ready.
    let checks = [
      { name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "CI scope", status: "COMPLETED", conclusion: "SUCCESS" },
    ];
    const services = {
      fetchPr: () => delivery(task, { statusCheckRollup: checks }),
      fetchFindings: () => completeFindings,
      maxSeconds: 0,
      sleep: () => {
        throw new Error("The bounded observation should already have returned");
      },
    };
    const args = { "check-pr": "7", ...(watch ? { "watch-aftercare": true } : {}) };
    if (watch) {
      expect(run(args, dir, services)).toMatchObject({ ready: false });
      expect(watchAftercare(task, "7", dir, { ...services, readOnly: true })).toMatchObject({
        ready: false,
      });
    } else {
      // #958: gate失敗はthrowではなく ready:false + gateError の観測結果で返る
      const result = run(args, dir, services);
      expect(result.ready).toBe(false);
      expect(result.gateError).toMatch("Required check not observed successful");
    }
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    checks = [
      "Agent harness",
      "CI scope",
      "Lint",
      "Build",
      "Test",
      "E2E (Playwright / Chromium / public)",
      "E2E (Playwright / Chromium / authenticated)",
    ].map((name) => ({ name, status: "COMPLETED", conclusion: "SUCCESS" }));
    expect(run(args, dir, services)).toMatchObject({ ready: true });
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    expect(task.assessment).toEqual(cached);
  });
  it("returns actionable findings from a read-only watch without waiting or changing state", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const before = readFileSync(taskPath(dir), "utf8");
    const result = run({ "check-pr": "7", "watch-aftercare": true }, dir, {
      fetchPr: () => delivery(task),
      fetchFindings: () => ({ ...completeFindings, unhandledCount: 1 }),
      sleep: () => {
        throw new Error("Should return for agent judgment");
      },
    });
    expect(result).toMatchObject({ ready: false, reason: "action_required" });
    expect(readFileSync(taskPath(dir), "utf8")).toBe(before);
  });
  it("refuses local source changes during remote observation and stale batch inputs", () => {
    const { dir, git, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    let reads = 0;
    expect(() =>
      run({ "check-pr": "7" }, dir, {
        fetchPr: () => {
          if (++reads === 2) {
            writeFileSync(path.join(dir, "changed.txt"), "new head");
            git("add", ".");
            git("-c", "core.hooksPath=/dev/null", "commit", "-m", "concurrent change");
          }
          return delivery(task);
        },
        fetchFindings: () => completeFindings,
      }),
    ).toThrow("Local revision changed");
    task.state = "execute";
    expect(() => runRequiredVerification(task, dir, () => ({ status: 0 }))).toThrow(
      "Revision changed",
    );
  });

  it.each(["aftercare", "done"])("observes delivery in %s without rewriting the task", (state) => {
    const { dir, task } = repository();
    task.state = state;
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    const pr = delivery(task, {
      statusCheckRollup: [
        {
          name: "Agent harness",
          status: "COMPLETED",
          conclusion: "FAILURE",
          startedAt: "2026-01-01",
        },
        {
          name: "Agent harness",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          startedAt: "2026-01-02",
        },
        ...["CI scope", "Lint", "Build", "Test"].map((name) => ({
          name,
          status: "COMPLETED",
          conclusion: "SUCCESS",
        })),
      ],
    });
    let reads = 0;
    const result = run(parseArguments(["--check-pr", "7"]), dir, {
      fetchPr: () => {
        reads++;
        return pr;
      },
      fetchFindings: () => completeFindings,
    });
    expect(result).toMatchObject({ state, ready: true, head: task.head, unhandledFindings: 0 });
    expect(reads).toBe(2);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
  });

  it.each([
    { pagesComplete: false, unhandledCount: 0, unresolvedThreadCount: 0 },
    { ...completeFindings, unhandledCount: 1 },
    { ...completeFindings, unresolvedThreadCount: 1 },
  ])("reports unhandled findings as a gate failure without changing DONE", (findings) => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    const result = run({ "check-pr": "7" }, dir, {
      fetchPr: () => delivery(task),
      fetchFindings: () => findings,
    });
    // #958 F9: gate失敗はready:false+gateErrorで返る（flaky診断を返せるように）
    expect(result.ready).toBe(false);
    expect(result.gateError).toMatch(/Unhandled|collected/i);
    expect(result.flakyTests).toEqual([]);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
  });

  it("reports gate failures (HEAD/base/review/pending) and still surfaces flakyTests", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    for (const overrides of [
      { headRefOid: "e".repeat(40) },
      { baseRefOid: "e".repeat(40) },
      { reviewDecision: "CHANGES_REQUESTED" },
      { statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS" }] },
    ]) {
      const result = run({ "check-pr": "7" }, dir, {
        fetchPr: () => delivery(task, overrides),
        fetchFindings: () => completeFindings,
      });
      expect(result.ready).toBe(false);
      expect(result.gateError).toBeTruthy();
      expect(result.flakyTests).toEqual([]);
    }
    // 整合性エラー（TOCTOUでのHEAD/base変化）はgate失敗ではないので投げる
    let reads = 0;
    expect(() =>
      run({ "check-pr": "7" }, dir, {
        fetchPr: () => delivery(task, ++reads === 1 ? {} : { baseRefOid: "e".repeat(40) }),
        fetchFindings: () => completeFindings,
      }),
    ).toThrow("PR HEAD/base changed");
  });

  it("surfaces flakyTests even when a different check failed (red PR)", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const pr = delivery(task, {
      statusCheckRollup: [
        { name: "Agent harness", status: "COMPLETED", conclusion: "FAILURE" },
        {
          name: "E2E (Playwright / Chromium / public)",
          status: "COMPLETED",
          conclusion: "SUCCESS",
        },
      ],
    });
    const gh = (args) => {
      const joined = args.join(" ");
      if (joined.includes("check-runs"))
        return JSON.stringify({
          check_runs: [
            {
              name: "E2E (Playwright / Chromium / public)",
              conclusion: "success",
              html_url: "https://github.com/o/r/actions/runs/5/job/11",
            },
          ],
        });
      if (joined.includes("jobs/11/logs"))
        return "2026-10-07T00:00:00.0Z   1 flaky\n2026-10-07T00:00:00.0Z     [public] › e2e/home.spec.ts:3:1 › wobble ──────\n2026-10-07T00:00:00.0Z   3 passed\n";
      throw new Error(`unmocked: ${joined}`);
    };
    const result = run({ "check-pr": "7" }, dir, {
      fetchPr: () => pr,
      fetchFindings: () => completeFindings,
      resolveRepo: () => "o/r",
      gh,
    });
    expect(result.ready).toBe(false);
    expect(result.gateError).toBeTruthy();
    expect(result.flakyTests).toEqual([
      { check: "E2E (Playwright / Chromium / public)", file: "e2e/home.spec.ts", title: "wobble" },
    ]);
  });

  it("watches DONE without recording readiness into the task or repeating unchanged events", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    let reads = 0;
    let clock = 0;
    const result = run({ "check-pr": "7", "watch-aftercare": true }, dir, {
      fetchPr: () =>
        delivery(
          task,
          ++reads < 3
            ? {
                statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS" }],
              }
            : {},
        ),
      fetchFindings: () => completeFindings,
      now: () => clock,
      sleep: () => {
        clock += 1000;
      },
    });
    expect(result.ready).toBe(true);
    expect(result.watch.events).toHaveLength(2);
    expect(result.watch.last.ready).toBe(true);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
  });

  it("returns watch events and last on the --aftercare path, ready or not", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    let reads = 0;
    const ready = run({ aftercare: "7", "watch-aftercare": true }, dir, {
      fetchPr: () =>
        delivery(
          task,
          ++reads === 1
            ? { statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS" }] }
            : {},
        ),
      fetchFindings: () => completeFindings,
      sleep: () => {},
    });
    expect(ready.watch.events).toHaveLength(2);
    expect(ready.watch.last).toMatchObject({ ready: true, pending: [], failed: [] });
    expect(ready.aftercare.ready).toBe(true);

    let clock = 0;
    const notReady = run({ aftercare: "7", "watch-aftercare": true }, dir, {
      fetchPr: () =>
        delivery(task, {
          statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS" }],
        }),
      fetchFindings: () => completeFindings,
      now: () => clock,
      sleep: () => {
        clock += 1000;
      },
    });
    expect(notReady.watch.events).toHaveLength(1);
    expect(notReady.watch.last).toMatchObject({
      ready: false,
      pending: ["Agent harness"],
    });
    expect(notReady.ready).toBeUndefined();
  });

  it("skips identical PR bodies and preserves prose and literal replacement characters", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.spec.assumptions.push("Literal $& and $` are data");
    refreshTask(task, dir);
    saveTask(task, dir);
    const original = `Human Request\n\n${stateBlock(task)}\n\nUpdate history`;
    const writes = [];
    const gh = (args) => {
      if (args[1] === "view")
        return JSON.stringify({ body: original, headRefOid: task.head, baseRefOid: task.baseHead });
      writes.push(readFileSync(args.at(-1), "utf8"));
      return "";
    };
    expect(run({ "sync-pr": "7" }, dir, { gh }).synced).toBe(false);
    expect(writes).toEqual([]);
    task.spec.assumptions.push("New assumption");
    saveTask(task, dir);
    expect(run({ "sync-pr": "7" }, dir, { gh }).synced).toBe(true);
    expect(writes[0]).toMatch(/^Human Request/);
    expect(writes[0]).toMatch(/Update history$/);
    expect(parseStateBlock(writes[0]).spec.assumptions).toContain("Literal $& and $` are data");
  });

  it("#952: only the process kind runs locally; a failure retains lastFailure", () => {
    const { dir, task } = repository();
    // On the unified lane every tier requires only `process` locally —
    // thorough kinds are covered by CI (#952), so a T3 tier no longer
    // turns on serial local lint/unit/build runs.
    task.agentAssessment.applied_tier = "T3";
    task.assessment = computeAssessment(task, ["README.md"], dir);
    expect(requiredVerificationKinds(task)).toEqual(["process"]);
    delete task.verification.process;
    const kinds = [];
    expect(() =>
      runRequiredVerification(task, dir, (command) => {
        kinds.push(command.join(" "));
        return { status: command.join(" ").includes("test:process") ? 1 : 0 };
      }),
    ).toThrow("Verification failed: process");
    expect(kinds).toEqual(["node scripts/check-loop-docs.mjs", "pnpm run test:process"]);
    expect(loadTask(dir).lastFailure.kind).toBe("process");
    runRequiredVerification(loadTask(dir), dir, () => ({ status: 0 }));
    expect(Object.keys(loadTask(dir).verification)).toEqual(["process"]);
    expect(loadTask(dir).verification.lint).toBeUndefined();
  });

  it("creates an incremental packet with prior AC evidence and available full context", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "old-feature.txt"), "original\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
      ...eligibleReview(task),
      state: "review",
      head: prior,
      baseHead: task.baseHead,
      reviewer: "previous",
      acceptanceCriteria: [{ id: "AC1", evidence: "Previous verified behavior" }],
      findings: [{ id: "F1", status: "open", evidence: "Correction needed" }],
    });
    task.findings = task.history.at(-1).findings;
    writeFileSync(path.join(dir, "fix.txt"), "correction\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "fix");
    refreshTask(task, dir);
    task.state = "review";
    const parent = mkdtempSync(path.join(tmpdir(), "loop-delta-"));
    dirs.push(parent);
    const out = path.join(parent, "packet");
    buildReviewPacket(task, out, dir, { deltaFrom: prior });
    const packet = JSON.parse(readFileSync(path.join(out, "packet.json"), "utf8"));
    expect(packet.changedPaths).toEqual(["fix.txt"]);
    expect(packet.allChangedPaths).toEqual(["fix.txt", "old-feature.txt"]);
    expect(packet.priorFindings[0].id).toBe("F1");
    expect(readFileSync(path.join(out, "diff.patch"), "utf8")).not.toContain("old-feature.txt");
    expect(readFileSync(path.join(out, "full-diff.patch"), "utf8")).toContain("old-feature.txt");
    expect(
      JSON.parse(readFileSync(path.join(out, "previous-review.json"), "utf8")).acceptanceCriteria[0]
        .evidence,
    ).toContain("Previous");
    expect(JSON.parse(readFileSync(path.join(out, "review-template.json"), "utf8")).deltaFrom).toBe(
      prior,
    );
    for (const invalid of [task.head, "f".repeat(40), "bad-sha"])
      expect(() =>
        buildReviewPacket(task, path.join(parent, "invalid"), dir, { deltaFrom: invalid }),
      ).toThrow("deltaFrom");
    const previous = task.history.find((entry) => entry.event === "review_recorded");
    previous.baseHead = "f".repeat(40);
    expect(() =>
      buildReviewPacket(task, path.join(parent, "invalid"), dir, { deltaFrom: prior }),
    ).toThrow("base changed");
    previous.baseHead = task.baseHead;
    const acs = previous.acceptanceCriteria;
    delete previous.acceptanceCriteria;
    expect(() =>
      buildReviewPacket(task, path.join(parent, "invalid"), dir, { deltaFrom: prior }),
    ).toThrow("AC evidence");
    for (const invalid of [
      [],
      [{ id: "AC1", evidence: " " }],
      [{ id: "unknown", evidence: "ok" }],
    ]) {
      previous.acceptanceCriteria = invalid;
      expect(() =>
        buildReviewPacket(task, path.join(parent, "invalid"), dir, { deltaFrom: prior }),
      ).toThrow("AC evidence");
    }
    previous.acceptanceCriteria = acs;
    const unrelated = git("commit-tree", `${prior}^{tree}`, "-m", "unrelated root");
    previous.head = unrelated;
    expect(() =>
      buildReviewPacket(task, path.join(parent, "invalid"), dir, { deltaFrom: unrelated }),
    ).toThrow("ancestor");
  });
  it.each([
    ["old-feature.txt", "new-feature.txt"],
    [" old-feature.txt", "new-feature.txt"],
    ["old-feature.txt", " new-feature.txt"],
    ["\told-feature.txt", "new-feature.txt"],
    ["\nold-feature.txt", "new-feature.txt"],
    ["old-feature.txt ", "new-feature.txt"],
    ["old-feature.txt", "new-feature.txt "],
  ])("keeps both exact rename paths in review packets (%j -> %j)", (oldPath, newPath) => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, oldPath), "existing caller contract\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "existing source");
    git("branch", "-f", "preview", "HEAD");
    task.baseHead = git("rev-parse", "HEAD");
    writeFileSync(path.join(dir, "initial-feature.txt"), "reviewed feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "reviewed feature");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
      ...eligibleReview(task),
      head: prior,
      baseHead: task.baseHead,
      acceptanceCriteria: [{ id: "AC1", evidence: "Reviewed original caller" }],
      findings: [],
    });
    git("mv", "--", oldPath, newPath);
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "rename source");
    refreshTask(task, dir);
    task.state = "review";
    const parent = mkdtempSync(path.join(tmpdir(), "loop-rename-"));
    dirs.push(parent);
    const delta = path.join(parent, "delta");
    buildReviewPacket(task, delta, dir, { deltaFrom: prior });
    const packet = JSON.parse(readFileSync(path.join(delta, "packet.json"), "utf8"));
    expect(packet.changedPaths).toEqual([oldPath, newPath].sort());
    expect(packet.allChangedPaths).toEqual(["initial-feature.txt", oldPath, newPath].sort());
    expect(readFileSync(path.join(delta, "diff.patch"), "utf8")).toContain("deleted file mode");
    const full = path.join(parent, "full");
    buildReviewPacket(task, full, dir, { full: true });
    expect(JSON.parse(readFileSync(path.join(full, "packet.json"), "utf8")).changedPaths).toEqual(
      packet.allChangedPaths,
    );
  });
  it.each([
    ["trailing spaces", Buffer.from("trailing spaces  \n")],
    ["trailing tab", Buffer.from("trailing tab\t\n")],
    ["blank final line", Buffer.from("trailing spaces  \n\n")],
    ["binary", Buffer.from([0, 255, 0, 32, 32, 10])],
    ["non-UTF8 text", Buffer.from([255, 32, 32, 10])],
  ])("preserves exact applicable review patch bytes (%s)", (_label, contents) => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "prior.txt"), "reviewed feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "previously reviewed");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
      ...eligibleReview(task),
      head: prior,
      baseHead: task.baseHead,
      acceptanceCriteria: [{ id: "AC1", evidence: "Reviewed prior source" }],
      findings: [],
    });
    writeFileSync(path.join(dir, "payload.txt"), contents);
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "patch edge");
    refreshTask(task, dir);
    task.state = "review";
    const parent = mkdtempSync(path.join(tmpdir(), "loop-patch-"));
    dirs.push(parent);
    const delta = path.join(parent, "delta");
    buildReviewPacket(task, delta, dir, { deltaFrom: prior });
    const full = path.join(parent, "full");
    buildReviewPacket(task, full, dir, { full: true });
    for (const [file, range] of [
      [path.join(delta, "diff.patch"), `${prior}..${task.head}`],
      [path.join(delta, "full-diff.patch"), `${task.baseRef}...${task.head}`],
      [path.join(full, "diff.patch"), `${task.baseRef}...${task.head}`],
    ]) {
      const raw = execFileSync("git", ["diff", "--binary", "--no-renames", range], { cwd: dir });
      expect(readFileSync(file).equals(raw)).toBe(true);
      expect(() => git("apply", "--reverse", "--check", file)).not.toThrow();
    }
  });
  it("rechecks GitHub at DONE and discards cached success when that recheck fails", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.aftercare = {
      head: task.head,
      baseHead: task.baseHead,
      ready: true,
      pr: 1,
      checkedAt: "2000-01-01",
    };
    saveTask(task, dir);
    let called = false;
    expect(() =>
      run({ event: "ready" }, dir, {
        aftercare() {
          called = true;
          throw new Error("approval withdrawn");
        },
      }),
    ).toThrow("approval withdrawn");
    expect(called).toBe(true);
    expect(loadTask(dir).aftercare).toBeNull();
    expect(loadTask(dir).state).toBe("aftercare");
  });
  it("executes read-only observation and no-op sync through the real CLI", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    refreshTask(task, dir);
    saveTask(task, dir);
    const before = readFileSync(taskPath(dir), "utf8");
    const gitDir = path.dirname(taskPath(dir));
    const bin = path.join(gitDir, "test-bin");
    mkdirSync(bin);
    const fixture = path.join(gitDir, "delivery.json");
    const pr = { ...delivery(task), body: stateBlock(task), findings: completeFindings };
    writeFileSync(fixture, JSON.stringify(pr));
    writeFileSync(
      path.join(bin, "gh"),
      `#!${process.execPath}\nimport { readFileSync } from 'node:fs';\nif (process.argv[3] !== 'view') process.exit(99);\nconsole.log(readFileSync(process.env.LOOP_TEST_PR_JSON, 'utf8'));\n`,
      { mode: 0o755 },
    );
    // Only the remote response is stubbed; the production CLI/gates run unchanged.
    writeFileSync(path.join(gitDir, "info", "exclude"), "scripts/collect-pr-findings.mjs\n");
    writeFileSync(
      path.join(dir, "scripts", "collect-pr-findings.mjs"),
      "import { readFileSync } from 'node:fs'; console.log(JSON.stringify(JSON.parse(readFileSync(process.env.LOOP_TEST_PR_JSON, 'utf8')).findings));\n",
    );
    const cli = (...args) =>
      execFileSync(process.execPath, [path.join(root, "scripts/loop-runner.mjs"), ...args], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          LOOP_TEST_PR_JSON: fixture,
        },
      });
    expect(JSON.parse(cli("--check-pr", "7")).ready).toBe(true);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(before);
    expect(JSON.parse(cli("--sync-pr", "7")).synced).toBe(false);
    pr.findings = { ...completeFindings, unhandledCount: 1 };
    writeFileSync(fixture, JSON.stringify(pr));
    // #958 F9: gate失敗はready:false+gateErrorで返る（診断を返せるようにthrowしない）
    const unhandled = JSON.parse(cli("--check-pr", "7"));
    expect(unhandled.ready).toBe(false);
    expect(unhandled.gateError).toMatch(/Unhandled|incompletely collected/);
    expect(unhandled.flakyTests).toEqual([]);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(before);
  });
  it("restores an old PR snapshot by invalidating evidence while keeping risk/findings/counters", () => {
    const { dir, git, task } = repository();
    task.risk = "T3";
    task.state = "aftercare";
    task.counters.review = 2;
    task.findings = [{ id: "F1", status: "open", evidence: "Needs correction" }];
    const body = stateBlock(task);
    writeFileSync(path.join(dir, "README.md"), "new head");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "new head");
    git("update-ref", "refs/heads/preview", "HEAD");
    const head = git("rev-parse", "HEAD");
    restoreTask(
      {
        body,
        headRefName: task.branch,
        baseRefName: "preview",
        headRefOid: head,
        baseRefOid: head,
      },
      dir,
    );
    const restored = loadTask(dir);
    expect(restored.state).toBe("execute");
    expect(restored.verification).toEqual({});
    expect(restored.agentAssessment).toBeNull();
    expect(restored.risk).toBe("T3");
    expect(restored.findings).toEqual(task.findings);
    expect(restored.counters.review).toBe(2);
  });

  it(
    "runs the startup-to-PR path through the real CLI in an isolated worktree",
    { timeout: 30000 },
    () => {
      const { git } = repository();
      const parent = mkdtempSync(path.join(tmpdir(), "loop-cli-"));
      dirs.push(parent);
      const checkout = path.join(parent, "checkout");
      git("worktree", "add", "-b", "codex/integration", checkout, "preview");
      const spec = path.join(parent, "spec.json");
      writeFileSync(spec, JSON.stringify(taskFixture().spec));
      const cli = (...args) =>
        execFileSync(process.execPath, [path.join(root, "scripts/loop-runner.mjs"), ...args], {
          cwd: checkout,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      const initial = JSON.parse(
        cli(
          "--init",
          spec,
          "--task",
          "integration",
          "--runtime",
          "codex",
          "--implementer",
          "author",
          "--base",
          "preview",
        ),
      );
      // Default CLI output is a compact summary — never the full task document.
      expect(initial).toMatchObject({
        taskId: "integration",
        state: "refine",
        risk: "T1",
      });
      for (const key of ["configuration", "assessment", "history", "spec", "profile"])
        expect(initial).not.toHaveProperty(key);
      // Profiles are gone: configuration records only the runtime.
      const config = loadTask(checkout).configuration;
      expect(config.runtime.name).toBe("codex");
      expect(config).not.toHaveProperty("profile");
      expect(config).not.toHaveProperty("selection");
      // Leaving REFINE requires the assessment recorded via --assessment.
      expect(() => cli("--event", "ready")).toThrow();
      const refineAssessment = path.join(parent, "refine-assessment.json");
      writeFileSync(
        refineAssessment,
        JSON.stringify({
          ...taskFixture().agentAssessment,
          verification_load: { level: "routine", rationale: "process checks only" },
        }),
      );
      cli("--assessment", refineAssessment);
      cli("--event", "ready");
      // No profile decision is recorded anymore; a legacy verification_load
      // field in the assessment input is accepted and ignored.
      const decided = loadTask(checkout).configuration;
      expect(decided).not.toHaveProperty("selection");
      expect(decided).not.toHaveProperty("profile");
      writeFileSync(path.join(checkout, "README.md"), "change");
      execFileSync("git", ["add", "."], { cwd: checkout });
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "change"], {
        cwd: checkout,
        stdio: "pipe",
      });
      expect(() => cli("--event", "ready")).toThrow();
      const assessment = path.join(parent, "assessment.json");
      writeFileSync(assessment, JSON.stringify(taskFixture().agentAssessment));
      cli("--assessment", assessment);
      cli("--verify-required");
      // ready needs the verify:prepush marker for this HEAD.
      markPrepush(
        checkout,
        execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim(),
      );
      cli("--event", "ready");
      const task = loadTask(checkout);
      const report = path.join(parent, "review.json");
      writeFileSync(report, JSON.stringify(reviewFixture(task)));
      cli("--review", report);
      cli("--event", "clean");
      expect(parseStateBlock(cli("--export")).state).toBe("aftercare");
      expect(() => cli("--event", "ready")).toThrow();
      expect(loadTask(checkout).state).toBe("aftercare");
      // Focused read actions expose decision data without dumping the task.
      const status = JSON.parse(cli("--status"));
      expect(status).toMatchObject({ taskId: "integration", state: "aftercare" });
      expect(status.verification.process).toBe("pass");
      expect(status).not.toHaveProperty("configuration");
      const explain = JSON.parse(cli("--explain"));
      expect(explain.missing).toContain("aftercare");
      expect(explain.verificationDetail.process.appliesTo.head).toBe(task.head);
      const artifacts = JSON.parse(cli("--artifacts"));
      expect(artifacts.artifacts.process.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifacts.artifacts.process.artifact.available).toBe(true);
      // The manifest references the log artifact; it never contains raw log text.
      const entry = artifacts.artifacts.process.artifact;
      expect(path.isAbsolute(entry.path)).toBe(false);
      expect(entry.resolved).toContain("agent-evidence");
      expect(entry.resolved.startsWith(path.join(checkout, ".git"))).toBe(false);
      const stateFile = path.join(parent, "state.md");
      expect(JSON.parse(cli("--export-file", stateFile)).written).toBe(stateFile);
      expect(parseStateBlock(readFileSync(stateFile, "utf8")).state).toBe("aftercare");
    },
  );
  it("rejects caller-selected states and missing specs", () => {
    expect(() => resolveLoopStep({ state: "aftercare", event: "ready", root })).toThrow(
      "Persisted task",
    );
    const task = taskFixture(root, { state: "refine" });
    task.spec.openMaterialDecisions = ["Unresolved decision"];
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("open material");
    task.spec.openMaterialDecisions = [];
    task.spec.acceptanceCriteria = [];
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow();
    expect(() =>
      resolveLoopStep({ task: taskFixture(), state: "aftercare", event: "ready", root }),
    ).toThrow("persisted");
  });
  it("requires current tests, skill acknowledgement, and fresh independent review for T3", () => {
    const task = taskFixture();
    // "HEAD" keeps the content-rule diff read resolvable in shallow checkouts.
    task.baseRef = "HEAD";
    task.assessment = computeAssessment(task, ["convex/schema.ts"]);
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("skill");
    task.skills = task.assessment.requiredSkills;
    // #952: T3のEXECUTE readyもprepush markerが正本（ローカル証跡の代わり）。
    // 一意headでこのworktreeの.gitへ残すmarkerが前回実行と衝突しないようにする。
    task.head = createHash("sha256").update(String(Date.now())).digest("hex");
    task.review = null;
    // The head change invalidates the fixture's process evidence — refresh it.
    task.verification.process = { head: task.head, baseHead: task.baseHead, success: true };
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("verify:prepush");
    markPrepush(root, task.head);
    expect(resolveLoopStep({ task, event: "ready", root }).nextState).toBe("review");
    task.state = "review";
    task.review = reviewFixture(task, { independent: false, reviewer: "author" });
    expect(() => resolveLoopStep({ task, event: "clean", root })).toThrow("Independent review");
    task.review = reviewFixture(task);
    expect(() =>
      resolveLoopStep({ task, event: "clean", exit: { blockers: ["incomplete"] }, root }),
    ).toThrow("blockers");
    task.review.head = "stale";
    expect(() => resolveLoopStep({ task, event: "clean", root })).toThrow("HEAD");
    task.review = reviewFixture(task);
    // #952: T3のcleanは現在HEADのCI評価を記録した証跡を要求する。
    task.reviewCi = { ok: true, head: task.head, baseHead: task.baseHead };
    expect(resolveLoopStep({ task, event: "clean", root }).nextState).toBe("aftercare");
    task.state = "aftercare";
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("GitHub");
  });
  it("requires explicit approval to leave human gate and evidence to leave incident", () => {
    const task = taskFixture(root, { state: "human_gate" });
    expect(() => resolveLoopStep({ task, event: "resolved", root })).toThrow("approval");
    expect(
      resolveLoopStep({
        task,
        event: "resolved",
        exit: {
          approval: { source: "user", reference: "user message authorizing this operation" },
        },
        root,
      }).nextState,
    ).toBe("refine");
    task.state = "incident";
    expect(() => resolveLoopStep({ task, event: "resolved", root })).toThrow("resolution");
  });
  it("persists HEAD/base invalidation across reloads and includes untracked paths", () => {
    const { dir, git, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    writeFileSync(path.join(dir, "README.md"), "update");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "change");
    const updated = refreshTask(loadTask(dir), dir);
    saveTask(updated, dir);
    expect(loadTask(dir).state).toBe("execute");
    expect(loadTask(dir).verification).toEqual({});
    expect(loadTask(dir).review).toBeNull();
    writeFileSync(path.join(dir, "schema-change.ts"), "untracked");
    expect(refreshTask(updated, dir).assessment.runtimeRelevant).toBe(true);
    expect(() => runVerification(updated, "process", dir, () => ({ status: 0 }))).toThrow(
      "Commit all",
    );
    rmSync(path.join(dir, "schema-change.ts"));
    git("update-ref", "refs/heads/preview", "HEAD");
    updated.review = reviewFixture(updated);
    refreshTask(updated, dir);
    expect(updated.review).toBeNull();
  });
  it("records actual command outcomes and stops three consecutive failed attempts", () => {
    const { dir, task } = repository();
    for (let i = 0; i < 3; i++)
      expect(() => runVerification(task, "process", dir, () => ({ status: 1 }))).toThrow(
        "Verification failed",
      );
    expect(loadTask(dir).state).toBe("incident");
    expect(() => runVerification(task, "process", dir, () => ({ status: 0 }))).toThrow("execute");
  });
  it("requires reassessment every two rounds and stops at the configured cap (AC5)", () => {
    const task = taskFixture(root, { state: "review" });
    for (let i = 0; i < 5; i++) {
      task.state = "review";
      // Rounds 2 and 4 demand a strategy reassessment.
      if ((i + 1) % 2 === 0)
        expect(() => transitionTask(task, "findings", { reason: "finding" }, root)).toThrow(
          "reassessment",
        );
      transitionTask(
        task,
        "findings",
        { reason: "finding", reassessment: "narrowed reproduction" },
        root,
      );
    }
    expect(task.state).toBe("incident");
    task.counters.ci = 2;
    task.state = "aftercare";
    transitionTask(task, "ci_failure", ciFailureExit(), root);
    expect(task.state).toBe("incident");
  });
  it("requires ciFailure + reproduction on ci_failure and blocks ready until resolved", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    // exit欠落は遷移自体を拒否する（AC3/AC5の機械gate）
    expect(() => transitionTask(task, "ci_failure", { reason: "x" }, dir)).toThrow(
      /ci_failure exit requires reproduction/,
    );
    expect(() =>
      transitionTask(
        task,
        "ci_failure",
        {
          reason: "x",
          reproduction: ciFailureExit().reproduction,
        },
        dir,
      ),
    ).toThrow(/ci_failure exit requires ciFailure record/);
    transitionTask(task, "ci_failure", ciFailureExit(), dir);
    expect(task.state).toBe("execute");
    // ciFailureゲートだけを見るため検証要件を潰す（他要件は別テストの管轄）
    task.assessment = { ...task.assessment, verification: {}, requiredSkills: [] };
    // 未解決ciFailureは ready を fail-closed させる
    expect(() => resolveLoopStep({ task, event: "ready", root: dir })).toThrow(
      /Unresolved ciFailure records remain/,
    );
    // runner自身の解決: verify 0のみ解決扱い
    const failFirst = resolveCiFailures(task, dir, { verifyPrepush: () => ({ status: 1 }) });
    expect(failFirst[0].resolved).toBe(false);
    expect(task.ciFailures[0].resolvedAt).toBeNull();
    const passNext = resolveCiFailures(task, dir, { verifyPrepush: () => ({ status: 0 }) });
    expect(passNext[0].resolved).toBe(true);
    expect(task.ciFailures[0].resolvedAt).toBeTruthy();
    expect(task.ciFailures[0].resolvedHead).toBe(task.head);
    // 解決済みは ready をブロックしない（他要件の欠落はこの検証対象外）
    expect(() => resolveLoopStep({ task, event: "ready", root: dir })).not.toThrow(
      /Unresolved ciFailure records remain/,
    );
  });
  it("records multiple ciFailure records in one transition and resolves each", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    const multi = ciFailureExit({
      ciFailure: [
        { check: "Lint / lint", head: "a".repeat(40), reproduce: "pnpm run lint" },
        {
          check: "E2E (Playwright / Chromium / authenticated)",
          head: "a".repeat(40),
          failedTests: [
            { file: "e2e/a.spec.ts", title: "one" },
            { file: "e2e/b.spec.ts", title: "two" },
          ],
          reproduce: "pnpm run e2e:isolated -- e2e/a.spec.ts",
        },
      ],
    });
    transitionTask(task, "ci_failure", multi, dir);
    expect(task.state).toBe("execute");
    expect(task.ciFailures.map((f) => f.check)).toEqual([
      "Lint / lint",
      "E2E (Playwright / Chromium / authenticated)",
    ]);
    task.assessment = { ...task.assessment, verification: {}, requiredSkills: [] };
    expect(() => resolveLoopStep({ task, event: "ready", root: dir })).toThrow(
      /Unresolved ciFailure records remain/,
    );
    // e2e失敗は --include をファイルごとに繰り返す（verify-prepushは1引数1パス）
    const argvSeen = [];
    resolveCiFailures(task, dir, {
      verifyPrepush: (argv) => {
        argvSeen.push(argv);
        return { status: 0 };
      },
    });
    const e2eArgv = argvSeen.find((argv) => argv.includes("--include"));
    expect(e2eArgv).toEqual([
      "scripts/verify-prepush.mjs",
      "--include",
      "e2e/a.spec.ts",
      "--include",
      "e2e/b.spec.ts",
    ]);
    expect(task.ciFailures.every((f) => f.resolvedAt)).toBe(true);
    // 同checkが再度失敗したら未解決レコードを差し替える（重複しない）
    task.state = "aftercare";
    transitionTask(task, "ci_failure", ciFailureExit(), dir);
    const same = task.ciFailures.filter(
      (f) => f.check === "E2E (Playwright / Chromium / authenticated)",
    );
    // 解決済みは履歴として残し、未解決は最新抽出で差し替え（1件のみ）
    expect(same.filter((f) => !f.resolvedAt)).toHaveLength(1);
  });
  it("gates --resolve-ci-failures to execute/aftercare states", () => {
    const { dir, task } = repository();
    task.state = "refine";
    saveTask(task, dir);
    expect(() => run({ "resolve-ci-failures": true }, dir)).toThrow(
      /requires execute or aftercare/,
    );
  });
  it("routes not_reproduced CI failures to incident", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    transitionTask(
      task,
      "ci_failure",
      ciFailureExit({
        reproduction: {
          command: "pnpm run e2e:isolated",
          result: "not_reproduced",
          note: "green locally, red on CI only",
        },
      }),
      dir,
    );
    expect(task.state).toBe("incident");
  });
  it("round-trips durable PR snapshots and rejects missing/duplicate snapshots", () => {
    const task = taskFixture();
    expect(parseStateBlock(stateBlock(task))).toEqual(
      hydrateExportedTask(compactTaskForExport(task)),
    );
    expect(() => parseStateBlock("no checkpoint")).toThrow();
    expect(() => parseStateBlock(stateBlock(task) + stateBlock(task))).toThrow();
  });
  it("rejects missing CLI option values and unknown options", () => {
    for (const flag of ["--model", "--profile", "--runtime", "--event", "--exit", "--review"])
      expect(() => parseArguments([flag])).toThrow("requires a value");
    expect(() => parseArguments(["--magic"])).toThrow("unknown option");
    // A bare "--" (forwarded verbatim by pnpm run) is skipped, not an option.
    expect(parseArguments(["--", "--export"])).toEqual({ export: true });
  });
  it("names cli_output commands after the executed action, watch runs tagged", () => {
    expect(cliCommandName(parseArguments(["--status"]))).toBe("status");
    expect(cliCommandName(parseArguments(["--export"]))).toBe("export");
    expect(cliCommandName(parseArguments(["--verify-required"]))).toBe("verify-required");
    expect(cliCommandName(parseArguments(["--review-packet", "/tmp/p"]))).toBe("review-packet");
    expect(cliCommandName(parseArguments(["--check-pr", "7"]))).toBe("check-pr");
    expect(cliCommandName(parseArguments(["--check-pr", "7", "--watch-aftercare"]))).toBe(
      "check-pr+watch-aftercare",
    );
    expect(cliCommandName(parseArguments(["--aftercare", "7", "--watch-aftercare"]))).toBe(
      "aftercare+watch-aftercare",
    );
    expect(cliCommandName(parseArguments([]))).toBe("none");
  });
  it("accepts --model for backward compatibility without recording it", () => {
    const { git } = repository();
    const parent = mkdtempSync(path.join(tmpdir(), "loop-compat-"));
    dirs.push(parent);
    const checkout = path.join(parent, "checkout-compat");
    git("worktree", "add", "-b", "codex/compat", checkout, "preview");
    const spec = path.join(parent, "spec-compat.json");
    writeFileSync(spec, JSON.stringify(taskFixture().spec));
    const task = run(
      {
        init: spec,
        task: "compat",
        model: "legacy-model",
        runtime: "codex",
        implementer: "author",
        base: "preview",
      },
      checkout,
    );
    expect(task.configuration.runtime.name).toBe("codex");
    expect(task.configuration).not.toHaveProperty("model");
    expect(task.configuration).not.toHaveProperty("profile");
    expect(task.configuration).not.toHaveProperty("selection");
  });
  it("requires the exact execute state for verification", () => {
    const { dir, task } = repository();
    task.state = "done";
    expect(() => runVerification(task, "process", dir, () => ({ status: 0 }))).toThrow("execute");
    expect(readFileSync(path.join(dir, ".agent/process.yaml"), "utf8")).toContain(
      "same_failure_max: 3",
    );
  });
  it("records verification evidence as an artifact manifest outside the worktree", () => {
    const { dir, task } = repository();
    const result = runVerification(task, "process", dir);
    const evidence = result.verification.process;
    expect(evidence.success).toBe(true);
    expect(evidence.run).toMatchObject({ head: task.head, baseHead: task.baseHead });
    expect(evidence.run.durationMs).toBeGreaterThanOrEqual(0);
    expect(evidence.appliesTo).toEqual({
      head: task.head,
      baseHead: task.baseHead,
    });
    // Persisted artifact paths stay relative to the evidence root so the state
    // block never leaks local filesystem layout into the PR body.
    expect(path.isAbsolute(evidence.artifact.path)).toBe(false);
    expect(evidence.artifact.path.startsWith(task.taskId)).toBe(true);
    expect(evidence.artifact.bytes).toBeGreaterThan(0);
    expect(stateBlock(result)).not.toContain(dir);
    const entry = artifactManifest(result, dir).process.artifact;
    expect(entry.resolved).toContain("agent-evidence");
    expect(entry.available).toBe(true);
    const log = readFileSync(entry.resolved, "utf8");
    expect(createHash("sha256").update(log).digest("hex")).toBe(evidence.artifact.sha256);
    expect(evidence.summary.lastLines.join("\n")).toContain("exit 0");
    // Artifact lives under git-internal storage: the worktree stays clean.
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).toBe("");
  });
  it("keeps legacy injected runners working and tails failures without raw logs", () => {
    const { dir, task } = repository();
    // Legacy runners returning only { status } keep working; context is additive.
    expect(() => runVerification(task, "process", dir, () => ({ status: 0 }))).not.toThrow();
    const noisy = (command, { fd }) => {
      for (let i = 1; i <= 100; i++) writeSync(fd, `line-${String(i).padStart(3, "0")}\n`);
      return { status: 1 };
    };
    let message = "";
    try {
      runVerification(task, "process", dir, noisy);
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain("Verification failed: process (exit 1)");
    expect(message).toContain("log ");
    expect(message).toContain("line-100");
    expect(message).not.toContain("line-050");
  });
  it("accepts legacy flat and manifest-shaped verification evidence alike", () => {
    const task = taskFixture();
    // taskFixture records the legacy { head, baseHead, success } shape.
    expect(currentEvidence(task.verification.process, task)).toBe(true);
    expect(verificationSummary(task)).toEqual({ process: "pass" });
    expect(artifactManifest(task).process.artifact).toBeNull();
    task.verification.process = verificationManifestFixture(task);
    expect(currentEvidence(task.verification.process, task)).toBe(true);
    const manifest = artifactManifest(task).process;
    // #953: appliesTo is now just the recorded HEAD/base binding — no
    // fingerprints, no contract version (evidence reuse was removed).
    expect(manifest.appliesTo).toEqual({ head: task.head, baseHead: task.baseHead });
    // Manifests survive restore without artifact bodies: availability is probed.
    expect(manifest.artifact.available).toBe(false);
  });
  it("summarizes tasks into compact next-action output", () => {
    const task = taskFixture();
    const summary = summarizeTask(task);
    expect(summary).toMatchObject({
      taskId: task.taskId,
      state: "execute",
      head: task.head,
      openFindings: 0,
    });
    for (const key of ["configuration", "assessment", "history", "spec", "findings", "profile"])
      expect(summary).not.toHaveProperty(key);
    expect(summary.next).toEqual(["node scripts/loop-runner.mjs --event ready"]);
    task.verification.process.head = "stale";
    const stale = summarizeTask(task);
    expect(stale.verification.process).toBe("stale");
    expect(stale.missing).toContain("verify:process");
    expect(stale.next).toEqual(["node scripts/loop-runner.mjs --verify-required"]);
    task.assessment.verification = { process: true, lint: true, unit: true, build: true };
    task.verification = {};
    expect(summarizeTask(task).next).toEqual(["node scripts/loop-runner.mjs --verify-required"]);
  });
  it("rejects traversal task ids at init and at the artifact sink", () => {
    const { dir, task } = repository();
    const parent = mkdtempSync(path.join(tmpdir(), "loop-taskid-"));
    dirs.push(parent);
    const spec = path.join(parent, "spec.json");
    writeFileSync(spec, JSON.stringify(taskFixture().spec));
    expect(() =>
      run(
        {
          init: spec,
          task: "../escape",
          runtime: "codex",
          implementer: "author",
          base: "preview",
        },
        dir,
      ),
    ).toThrow("task id");
    expect(() =>
      run(
        {
          init: spec,
          task: "x".repeat(300),
          runtime: "codex",
          implementer: "author",
          base: "preview",
        },
        dir,
      ),
    ).toThrow("task id");
    task.taskId = "../escape";
    expect(() => runVerification(task, "process", dir, () => ({ status: 0 }))).toThrow("task id");
  });
  it("surfaces refine gaps for missing assessment and invalid specs", () => {
    const task = taskFixture(root, { state: "refine" });
    expect(summarizeTask(task).missing).toEqual([]);
    delete task.agentAssessment;
    expect(summarizeTask(task).missing).toContain("assessment");
    task.agentAssessment = structuredClone(agentAssessment);
    task.spec.acceptanceCriteria = [
      { id: "AC1", text: "one" },
      { id: "AC1", text: "duplicate" },
    ];
    expect(summarizeTask(task).missing).toContain("spec:acceptanceCriteria");
  });
  it("blocks refine->ready when a present assessment is invalid", () => {
    const task = taskFixture(root, { state: "refine" });
    expect(summarizeTask(task).missing).toEqual([]);
    task.agentAssessment.risk_assessment.blast_radius = "bogus";
    expect(summarizeTask(task).missing).toContain("assessment(invalid)");
    expect(() => transitionTask(task, "ready", {}, root)).toThrow("Invalid agent assessment");
  });
  it("exposes --status/--explain/--artifacts through run() without changing the task", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const status = run({ status: true }, dir);
    expect(status.version).toBe(2);
    const explain = run({ explain: true }, dir);
    expect(explain.missing).toBeDefined();
    const artifacts = run({ artifacts: true }, dir);
    expect(artifacts.artifacts.process.run.head).toBe(task.head);
    // Read actions must not mutate the persisted state.
    expect(loadTask(dir).head).toBe(task.head);
  });
  /** Move `preview` one commit ahead on the given file, then switch back. */
  const upstreamCommit = (dir, git, file, content = "upstream\n") => {
    git("switch", "preview");
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", `upstream ${file}`);
    git("switch", "codex/task");
  };
  it("drops all verification evidence on base drift (#953: no reuse)", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    // Even a head-tree-untouched upstream move invalidates every kind —
    // evidence reuse was removed; only the recorded HEAD/base bind counts.
    upstreamCommit(dir, git, "docs/upstream.md");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
    expect(verificationSummary(refreshed).process).toBe("missing");
  });
  it("drops evidence after any head move, including a message-only amend", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    git("-c", "core.hooksPath=/dev/null", "commit", "--amend", "-m", "renamed");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
  });
  it("drops evidence after a rebase", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    upstreamCommit(dir, git, "src/upstream.ts", "export {};\n");
    git("-c", "core.hooksPath=/dev/null", "rebase", "preview");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
  });
  it("drops verification evidence when the feature patch changes", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    writeFileSync(path.join(dir, "README.md"), "changed\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature change");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
  });
  it("drops legacy flat evidence (no appliesTo) on revision change", () => {
    const { dir: dir2, git: git2, task: task2 } = repository();
    task2.verification.process = {
      head: task2.head,
      baseHead: task2.baseHead,
      success: true,
    };
    saveTask(task2, dir2);
    upstreamCommit(dir2, git2, "src/legacy.ts", "export {};\n");
    expect(refreshTask(loadTask(dir2), dir2).verification).toEqual({});
  });
  it("invalidates review and aftercare evidence on revision change", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.aftercare = {
      head: task.head,
      baseHead: task.baseHead,
      ready: true,
      pr: 1,
      checkedAt: "2026-01-01",
    };
    saveTask(task, dir);
    upstreamCommit(dir, git, "src/app.ts", "export {};\n");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
    expect(refreshed.review).toBeNull();
    expect(refreshed.aftercare).toBeNull();
    expect(refreshed.state).toBe("execute");
  });
  it("records a verification plan with execution, scope, reason and AC references", () => {
    const task = taskFixture();
    const processOnly = Object.fromEntries(
      computeAssessment(task, ["README.md"]).verificationPlan.map((i) => [i.kind, i]),
    );
    expect(processOnly.process).toMatchObject({
      required: true,
      execution: "local",
      reason: "required for every change",
    });
    expect(processOnly.process.commands[0]).toEqual(["node", "scripts/check-loop-docs.mjs"]);
    expect(processOnly.e2e).toMatchObject({ required: false, execution: "github" });
    expect(
      computeAssessment(task, ["README.md"]).verificationPlan.every((i) => i.acs.includes("AC1")),
    ).toBe(true);
    const runtime = Object.fromEntries(
      computeAssessment(task, ["src/app.ts"]).verificationPlan.map((i) => [i.kind, i]),
    );
    expect(runtime.e2e.required).toBe(true);
    expect(runtime.unit).toMatchObject({
      required: true,
      execution: "local",
      reason: "runtime-relevant paths changed",
    });
  });
  it("builds a review packet with diff, manifest, template and contracts", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    runVerification(task, "process", dir, () => ({ status: 0 }));
    task.state = "review";
    task.risk = "T3";
    task.assessment = { ...task.assessment, review: { independent: true } };
    const parent = mkdtempSync(path.join(tmpdir(), "loop-packet-"));
    dirs.push(parent);
    const out = path.join(parent, "packet");
    const result = buildReviewPacket(task, out, dir);
    expect(result.files).toBe(5);
    const packet = JSON.parse(readFileSync(path.join(out, "packet.json"), "utf8"));
    expect(packet).toMatchObject({
      taskId: task.taskId,
      head: task.head,
      baseHead: task.baseHead,
      goal: task.spec.goal,
      risk: "T3",
    });
    expect(packet.changedPaths).toContain("feature.txt");
    expect(packet.acceptanceCriteria[0].id).toBe("AC1");
    expect(packet).not.toHaveProperty("reuseCandidates");
    const template = JSON.parse(readFileSync(path.join(out, "review-template.json"), "utf8"));
    expect(template).toMatchObject({
      head: task.head,
      independent: true,
      context: "fresh",
      findings: [],
    });
    expect(template.acceptanceCriteria).toEqual([{ id: "AC1", evidence: "TODO" }]);
    // _notes carries reviewer-facing contract hints (finding status enum,
    // deltaFrom, machine floor) — its absence caused an invalid status enum
    // in a real fresh-context review.
    expect(template._notes.join(" ")).toContain("open|fixed|dismissed");
    expect(readFileSync(path.join(out, "diff.patch"), "utf8")).toContain("feature.txt");
    // Reviewer-facing manifest: the conclusion (success, scope, log tail,
    // artifact path) without fingerprints the reviewer never checks.
    const manifest = JSON.parse(readFileSync(path.join(out, "verification-manifest.json"), "utf8"));
    expect(manifest.process).toMatchObject({
      success: true,
      scope: "full",
      artifact: expect.stringContaining("process"),
    });
    expect(manifest.process.summary.exitCode).toBe(0);
    expect(manifest.process.summary.lastLines.length).toBeGreaterThan(0);
    expect(manifest.process.run).toBeUndefined();
    expect(manifest.process.appliesTo).toBeUndefined();
    expect(manifest.process.commands).toBeUndefined();
    // The summary lives once, in task-summary.json — packet.json points at it.
    expect(packet.verification).toBe("task-summary.json");
    expect(JSON.parse(readFileSync(path.join(out, "task-summary.json"), "utf8"))).toMatchObject({
      state: "review",
      verification: { process: expect.stringContaining("pass") },
    });
    expect(existsSync(path.join(out, "contracts", "workflow-review.md"))).toBe(true);
  });
  it("preserves a complete review patch larger than 1 MiB", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "large-feature.txt"), "large diff line\n".repeat(80_000));
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "large feature");
    refreshTask(task, dir);
    task.state = "review";
    const expectedDiff = execFileSync(
      "git",
      ["diff", "--binary", "--no-renames", `${task.baseHead}...${task.head}`],
      { cwd: dir, maxBuffer: 32 * 1024 * 1024 },
    );
    expect(expectedDiff.length).toBeGreaterThan(1024 * 1024);
    const parent = mkdtempSync(path.join(tmpdir(), "loop-large-packet-"));
    dirs.push(parent);
    const out = path.join(parent, "packet");
    buildReviewPacket(task, out, dir);
    expect(readFileSync(path.join(out, "diff.patch")).equals(expectedDiff)).toBe(true);
  });
  it("refuses review packets outside review state or with a dirty tree", () => {
    const { dir, task } = repository();
    task.state = "execute";
    expect(() => buildReviewPacket(task, path.join(dir, "out"), dir)).toThrow("review");
    task.state = "review";
    writeFileSync(path.join(dir, "dirty.txt"), "dirty\n");
    expect(() => buildReviewPacket(task, path.join(dir, "out"), dir)).toThrow("Commit all");
  });
  it("emits watch events only on signature changes and records when ready", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const prFields = (checks) => ({
      number: 7,
      state: "OPEN",
      isDraft: false,
      headRefOid: task.head,
      baseRefOid: task.baseHead,
      baseRefName: "preview",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      statusCheckRollup: checks,
    });
    const ok = { name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" };
    const pending = { name: "Agent harness", status: "IN_PROGRESS", startedAt: "2026-01-01" };
    const findings = {
      pagesComplete: true,
      unhandledCount: 0,
      unresolvedThreadCount: 0,
    };
    // Ready needs the full always-required set (Agent harness + CI scope +
    // Lint/Build/Test); a lone Agent harness success would poll forever.
    const readyChecks = [
      ok,
      ...["CI scope", "Lint", "Build", "Test"].map((name) => ({
        name,
        status: "COMPLETED",
        conclusion: "SUCCESS",
      })),
    ];
    const prPolls = [prFields([pending]), prFields([pending]), prFields(readyChecks)];
    let recorded = false;
    const result = watchAftercare(task, 7, dir, {
      // Same {fetchPr, fetchFindings} shape as the production fetchers.
      fetchPr: () => prPolls.shift(),
      fetchFindings: () => findings,
      sleep: () => {},
      record: (t) => {
        recorded = true;
        t.aftercare = { head: t.head, baseHead: t.baseHead, ready: true, pr: 7 };
        return t;
      },
    });
    expect(result.ready).toBe(true);
    expect(recorded).toBe(true);
    // Two events only: initial pending signature, then the ready change.
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      ready: false,
      changed: false,
      pending: ["Agent harness"],
    });
    expect(result.events[1]).toMatchObject({ ready: true, changed: true });
    expect(result.events[1].removed).toMatchObject({ pending: ["Agent harness"] });
    expect(result.events[1].pending).toBeUndefined();
    expect(result.last).toMatchObject({ ready: true, pending: [], failed: [] });
    expect(result.task.aftercare.ready).toBe(true);
  });
  it("emits diff-only watch events with added/removed lists and changed scalars", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const prFields = (fields) => ({
      number: 7,
      state: "OPEN",
      isDraft: false,
      headRefOid: task.head,
      baseRefOid: task.baseHead,
      baseRefName: "preview",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      ...fields,
    });
    const check = (name, extra) => ({ name, ...extra });
    const polls = [
      prFields({
        statusCheckRollup: [
          check("Lint", { status: "IN_PROGRESS" }),
          check("Test", { status: "IN_PROGRESS" }),
        ],
      }),
      prFields({
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
        statusCheckRollup: [
          check("Test", { status: "IN_PROGRESS" }),
          check("Lint", { status: "COMPLETED", conclusion: "FAILURE" }),
        ],
      }),
      prFields({
        statusCheckRollup: [
          check("Test", { status: "COMPLETED", conclusion: "SUCCESS" }),
          check("Agent harness", { status: "COMPLETED", conclusion: "SUCCESS" }),
          ...["CI scope", "Lint", "Build"].map((name) =>
            check(name, { status: "COMPLETED", conclusion: "SUCCESS" }),
          ),
        ],
      }),
    ];
    let t = 0;
    const result = watchAftercare(task, 7, dir, {
      fetchPr: () => polls.shift(),
      fetchFindings: () => ({ pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 }),
      maxSeconds: 30,
      now: () => (t += 1000),
      sleep: () => {},
      record: (t) => {
        t.aftercare = { ready: true, pr: 7 };
        return t;
      },
    });
    expect(result.ready).toBe(true);
    expect(result.events).toHaveLength(3);
    // First event: full snapshot.
    expect(result.events[0]).toMatchObject({
      changed: false,
      ready: false,
      pending: ["Lint", "Test"],
      mergeable: "MERGEABLE",
    });
    // Second event: only the diff — Lint moved pending→failed, mergeable changed.
    const second = result.events[1];
    expect(second).toMatchObject({
      changed: true,
      ready: false,
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
    });
    expect(second.added).toEqual({ failed: ["Lint"] });
    expect(second.removed).toEqual({ pending: ["Lint"] });
    // Unchanged values (pending still contains Test, head/base, reviewDecision) stay out.
    expect(second.pending).toBeUndefined();
    expect(second.reviewDecision).toBeUndefined();
    expect(second.head).toBeUndefined();
    // Third event: everything cleared, ready.
    const third = result.events[2];
    expect(third).toMatchObject({ changed: true, ready: true, mergeable: "MERGEABLE" });
    expect(third.removed).toEqual({ pending: ["Test"], failed: ["Lint"] });
    // The final result always carries one complete snapshot.
    expect(result.last).toMatchObject({
      ready: true,
      pending: [],
      failed: [],
      mergeable: "MERGEABLE",
      head: task.head,
    });
  });
  it("accepts watch modifiers only with --aftercare", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    saveTask(task, dir);
    const parsed = parseArguments([
      "--aftercare",
      "7",
      "--watch-aftercare",
      "--interval-seconds",
      "30",
    ]);
    expect(parsed).toMatchObject({
      aftercare: "7",
      "watch-aftercare": true,
      "interval-seconds": "30",
    });
    expect(() => run({ "watch-aftercare": true }, dir)).toThrow("requires --aftercare");
    expect(() => run({ "interval-seconds": "30" }, dir)).toThrow("requires --watch-aftercare");
    expect(() =>
      run({ aftercare: "7", "watch-aftercare": true, "interval-seconds": "x" }, dir),
    ).toThrow(">= 1");
  });
  it("stops watching at the deadline without recording", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    saveTask(task, dir);
    const pending = {
      number: 7,
      headRefOid: task.head,
      baseRefOid: task.baseHead,
      statusCheckRollup: [
        { name: "Agent harness", status: "IN_PROGRESS", startedAt: "2026-01-01" },
      ],
    };
    let t = 0;
    const result = watchAftercare(task, 7, dir, {
      maxSeconds: 5,
      intervalSeconds: 60,
      fetchPr: () => pending,
      fetchFindings: () => ({}),
      now: () => (t += 1000),
      sleep: () => {},
      record: () => {
        throw new Error("must not record");
      },
    });
    expect(result.ready).toBe(false);
    expect(result.task.aftercare).toBeFalsy();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].ready).toBe(false);
  });
  it("treats a transient fetch failure as a poll event, then records when ready", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const ready = {
      number: 7,
      state: "OPEN",
      isDraft: false,
      headRefOid: task.head,
      baseRefOid: task.baseHead,
      baseRefName: "preview",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      statusCheckRollup: ["Agent harness", "CI scope", "Lint", "Build", "Test"].map((name) => ({
        name,
        status: "COMPLETED",
        conclusion: "SUCCESS",
      })),
    };
    let calls = 0;
    const result = watchAftercare(task, 7, dir, {
      fetchPr: () => {
        calls += 1;
        if (calls === 1) throw new Error("gh offline");
        return ready;
      },
      fetchFindings: () => ({
        pagesComplete: true,
        unhandledCount: 0,
        unresolvedThreadCount: 0,
      }),
      sleep: () => {},
      record: (t) => {
        t.aftercare = { head: t.head, baseHead: t.baseHead, ready: true, pr: 7 };
        return t;
      },
    });
    expect(result.ready).toBe(true);
    expect(result.events[0]).toMatchObject({ ready: false, error: "gh offline" });
    // The cleared `error` key cannot serialize as undefined, so the diff event
    // names it in removedKeys alongside the other changed fields.
    expect(result.events[1]).toMatchObject({
      ready: true,
      changed: true,
      removedKeys: ["error"],
    });
  });
  it("resolves the metrics sink: explicit file, never the real log under vitest, else the common dir", () => {
    const { dir, git, task } = repository();
    const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
    expect(metricsPath(dir, {})).toBe(path.join(common, "agent-metrics.jsonl"));
    expect(metricsPath(dir, { VITEST: "true" })).toBeNull();
    expect(metricsPath(dir, { VITEST: "true", AGENT_METRICS_FILE: "/x/m.jsonl" })).toBe(
      "/x/m.jsonl",
    );
    // This suite itself runs under vitest without an override: nothing is appended.
    runVerification(task, "process", dir, () => ({ status: 0 }));
    expect(existsSync(path.join(common, "agent-metrics.jsonl"))).toBe(false);
  });
  it("appends verify and revision metrics to the configured sink", () => {
    const { dir, git, task } = repository();
    const file = path.join(
      git("rev-parse", "--path-format=absolute", "--git-common-dir"),
      "agent-metrics.jsonl",
    );
    process.env.AGENT_METRICS_FILE = file;
    try {
      runVerification(task, "process", dir, () => ({ status: 0 }));
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    const readMetrics = () =>
      readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    const verified = readMetrics().at(-1);
    expect(verified).toMatchObject({
      action: "verify",
      kind: "process",
      result: "pass",
      taskId: task.taskId,
      state: "execute",
    });
    expect(verified.artifactBytes).toBeGreaterThan(0);
    saveTask(task, dir);
    upstreamCommit(dir, git, "src/app.ts", "export {};\n");
    process.env.AGENT_METRICS_FILE = file;
    try {
      refreshTask(loadTask(dir), dir);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    const revision = readMetrics().at(-1);
    expect(revision).toMatchObject({ action: "revision_changed", invalidated: 1 });
    expect(revision).not.toHaveProperty("reused");
  });
  it("records cli_output size for stdout and stderr without changing them", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const file = path.join(dir, "cli-metrics.jsonl");
    const stdout = [];
    const stderr = [];
    const io = {
      root: dir,
      log: (text) => stdout.push(text),
      errorLog: (text) => stderr.push(text),
    };
    process.env.AGENT_METRICS_FILE = file;
    try {
      expect(cliMain(["--status"], io)).toBe(0);
      // --export is only valid from aftercare — this run must fail on stderr.
      expect(cliMain(["--export"], io)).toBe(1);
      // Unknown options fail before the command can be resolved.
      expect(cliMain(["--magic"], io)).toBe(1);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    expect(stdout).toHaveLength(1);
    expect(stderr).toHaveLength(2);
    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      action: "cli_output",
      command: "status",
      exit: 0,
      taskId: task.taskId,
      state: "execute",
    });
    expect(lines[0].outputBytes).toBe(Buffer.byteLength(`${stdout[0]}\n`));
    expect(lines[1]).toMatchObject({ action: "cli_output", command: "export", exit: 1 });
    expect(lines[1].outputBytes).toBe(Buffer.byteLength(`${stderr[0]}\n`));
    expect(lines[2]).toMatchObject({ action: "cli_output", command: "unknown", exit: 1 });
    // No task content is stored — only the size of the emitted output.
    for (const line of lines) {
      expect(line.outputBytes).toBeGreaterThan(0);
      expect(line).not.toHaveProperty("output");
      expect(line).not.toHaveProperty("body");
    }
  });
  it("records cli_output with a null task when none is initialized", () => {
    const { dir } = repository();
    const file = path.join(dir, "cli-metrics-null.jsonl");
    process.env.AGENT_METRICS_FILE = file;
    try {
      expect(
        cliMain(["--status"], {
          root: dir,
          log: () => {},
          errorLog: () => {},
        }),
      ).toBe(1);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    const [line] = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((entry) => JSON.parse(entry));
    expect(line).toMatchObject({
      action: "cli_output",
      command: "status",
      exit: 1,
      taskId: null,
      state: null,
      head: null,
    });
  });
  it("reuses the ready poll's fetches, adding only one aftercare PR read", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    let prReads = 0;
    let findingReads = 0;
    const result = watchAftercare(task, 7, dir, {
      fetchPr: () => {
        prReads += 1;
        return delivery(task);
      },
      fetchFindings: () => {
        findingReads += 1;
        return completeFindings;
      },
      sleep: () => {
        throw new Error("ready on the first poll must not wait");
      },
    });
    expect(result.ready).toBe(true);
    // 1 poll fetch + 1 TOCTOU after-fetch; findings come from the same poll.
    expect(prReads).toBe(2);
    expect(findingReads).toBe(1);
    expect(result.task.aftercare.ready).toBe(true);
  });
  it("keeps the TOCTOU check on the reused before/final fetch pair", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const polls = [
      delivery(task),
      delivery(task, { headRefOid: "f".repeat(40) }), // head moves after the poll
    ];
    expect(() =>
      watchAftercare(task, 7, dir, {
        fetchPr: () => polls.shift(),
        fetchFindings: () => completeFindings,
        sleep: () => {},
      }),
    ).toThrow("PR HEAD/base changed");
  });
  it("skips prefetched before/findings calls in inspectPullRequest", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const before = delivery(task);
    let prReads = 0;
    let findingReads = 0;
    const { evidence } = inspectPullRequest(task, "7", undefined, dir, {
      before,
      findings: completeFindings,
      fetchPr: () => {
        prReads += 1;
        return delivery(task);
      },
      fetchFindings: () => {
        findingReads += 1;
        return completeFindings;
      },
    });
    expect(evidence.ready).toBe(true);
    expect(prReads).toBe(1); // only the after fetch
    expect(findingReads).toBe(0);
  });
  it("resolves the repository slug from the remote URL before gh, memoized per watch", () => {
    const { dir } = repository();
    expect(repositorySlugFromRemoteUrl("git@github.com:hondasports/kakeibo.git")).toBe(
      "hondasports/kakeibo",
    );
    expect(repositorySlugFromRemoteUrl("https://github.com/hondasports/kakeibo.git")).toBe(
      "hondasports/kakeibo",
    );
    expect(repositorySlugFromRemoteUrl("https://github.com/hondasports/kakeibo/")).toBe(
      "hondasports/kakeibo",
    );
    expect(repositorySlugFromRemoteUrl("not a url")).toBeNull();
    expect(repositorySlugFromRemoteUrl(null)).toBeNull();
    // Remote parses locally: no gh fallback is consulted.
    expect(
      resolveRepositorySlug(dir, {
        remoteUrl: "git@github.com:hondasports/kakeibo.git",
        repoView: () => {
          throw new Error("gh repo view must not run when the remote parses");
        },
      }),
    ).toBe("hondasports/kakeibo");
    // Unparseable remote falls back to a single gh repo view.
    const parsed = { owner: { login: "hondasports" }, name: "kakeibo" };
    expect(resolveRepositorySlug(dir, { remoteUrl: null, repoView: () => parsed })).toBe(
      "hondasports/kakeibo",
    );
    // Total failure resolves to null so collect-pr-findings keeps its own fallback.
    expect(
      resolveRepositorySlug(dir, {
        remoteUrl: null,
        repoView: () => {
          throw new Error("offline");
        },
      }),
    ).toBeNull();
    // fetchFindings resolves once across polls and always forwards --repo.
    let resolutions = 0;
    const argv = [];
    const { fetchFindings } = aftercareFetchers(7, "/tmp/handled", dir, {
      resolveRepo: () => {
        resolutions += 1;
        return "hondasports/kakeibo";
      },
      exec: (_bin, args) => {
        argv.push(args);
        return "{}";
      },
    });
    fetchFindings();
    fetchFindings();
    expect(resolutions).toBe(1);
    expect(argv[0]).toEqual(collectFindingsArgs(7, "/tmp/handled", "hondasports/kakeibo"));
    expect(argv[0]).toContain("--repo");
    expect(argv[1]).toEqual(argv[0]);
  });
});
