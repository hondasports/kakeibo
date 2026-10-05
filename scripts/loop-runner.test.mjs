import { afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseArguments,
  run,
  restoreTask,
  resolveLoopStep,
  transitionTask,
  refreshTask,
  runVerification,
  runRequiredVerification,
  saveTask,
  loadTask,
  taskPath,
  stateBlock,
  parseStateBlock,
  summarizeTask,
  artifactManifest,
  buildReviewPacket,
  inspectPullRequest,
  watchAftercare,
  compactTaskForExport,
  hydrateExportedTask,
  STATE_START,
  STATE_END,
  metricsPath,
  autoDeltaFrom,
  STATE_BLOCK_RECENT_HISTORY,
} from "./loop-runner.mjs";
import {
  agentAssessment,
  taskFixture,
  reviewFixture,
  verificationManifestFixture,
} from "./loop-test-fixtures.mjs";
import {
  computeAssessment,
  currentEvidence,
  missingRequirements,
  processSuiteFiles,
  unitFullCommand,
  validateReview,
  validateTask,
  verificationSummary,
} from "./loop-policy.mjs";
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
    statusCheckRollup: [{ name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" }],
    ...overrides,
  });
  const completeFindings = { pagesComplete: true, unhandledCount: 0, unresolvedThreadCount: 0 };
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
    const actual = computeAssessment(task, ["src/app.ts"]);
    expect(actual.runtimeRelevant).toBe(true);
    expect(actual.verification.e2e).toBe(true);
    task.risk = actual.risk.final;
    for (const kind of ["process", "lint", "unit", "build"])
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    let checks = delivery(task).statusCheckRollup;
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
    } else expect(() => run(args, dir, services)).toThrow("Required check not observed successful");
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    checks = [
      "Agent harness",
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
  ])("refuses incomplete or open findings without changing DONE", (findings) => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    expect(() =>
      run({ "check-pr": "7" }, dir, {
        fetchPr: () => delivery(task),
        fetchFindings: () => findings,
      }),
    ).toThrow("Unhandled or incompletely collected");
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
  });

  it("refuses changed HEAD/base, pending checks and revoked approval during observation", () => {
    const { dir, task } = repository();
    task.state = "done";
    task.review = reviewFixture(task);
    saveTask(task, dir);
    for (const overrides of [
      { headRefOid: "e".repeat(40) },
      { baseRefOid: "e".repeat(40) },
      { reviewDecision: "CHANGES_REQUESTED" },
      { statusCheckRollup: [{ name: "Agent harness", status: "IN_PROGRESS" }] },
    ])
      expect(() =>
        run({ "check-pr": "7" }, dir, {
          fetchPr: () => delivery(task, overrides),
          fetchFindings: () => completeFindings,
        }),
      ).toThrow();
    let reads = 0;
    expect(() =>
      run({ "check-pr": "7" }, dir, {
        fetchPr: () => delivery(task, ++reads === 1 ? {} : { baseRefOid: "e".repeat(40) }),
        fetchFindings: () => completeFindings,
      }),
    ).toThrow("PR HEAD/base changed");
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
    expect(result.watch).toHaveLength(2);
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
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

  it("runs missing required verification serially and retains completed evidence on failure", () => {
    const { dir, task } = repository();
    task.assessment.verification = {
      process: true,
      lint: true,
      unit: true,
      build: true,
      e2e: true,
    };
    task.configuration.profile.verification = "thorough";
    const kinds = [];
    expect(() =>
      runRequiredVerification(task, dir, (command) => {
        const kind =
          command.includes("lint") || command.includes("format:check")
            ? "lint"
            : command.includes("vitest")
              ? "unit"
              : "other";
        kinds.push(kind);
        if (kind === "unit") {
          expect(loadTask(dir).verification.lint.success).toBe(true);
          return { status: 1 };
        }
        return { status: 0 };
      }),
    ).toThrow("Verification failed: unit");
    expect(kinds).toEqual(["lint", "lint", "unit"]);
    expect(loadTask(dir).verification.lint.success).toBe(true);
    expect(loadTask(dir).verification.build).toBeUndefined();
    expect(loadTask(dir).lastFailure.kind).toBe("unit");
    runRequiredVerification(loadTask(dir), dir, () => ({ status: 0 }));
    expect(Object.keys(loadTask(dir).verification)).toEqual(["process", "lint", "unit", "build"]);
    expect(loadTask(dir).verification.unit.run.scope).toBe("full");
  });

  it("creates an incremental packet with prior AC evidence and available full context", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "old-feature.txt"), "original\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
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
    expect(() => cli("--check-pr", "7")).toThrow(/Unhandled or incompletely collected/);
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
        profile: { selected: "standard", source: "provisional" },
      });
      for (const key of ["configuration", "assessment", "history", "spec"])
        expect(initial).not.toHaveProperty(key);
      const provisional = loadTask(checkout).configuration;
      expect(provisional.profile.name).toBe("standard");
      expect(provisional.selection).toMatchObject({
        selected: "standard",
        source: "provisional",
      });
      // Leaving REFINE requires the determination inputs recorded via --assessment.
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
      const decided = loadTask(checkout).configuration;
      expect(decided.profile.name).toBe("fast");
      expect(decided.selection).toMatchObject({
        selected: "fast",
        source: "auto",
        inputs: {
          blast_radius: "local",
          uncertainty: "known_pattern",
          verification_load: "routine",
        },
      });
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
      // The same evaluation inputs must not trigger re-determination.
      expect(loadTask(checkout).configuration.selection.revisions).toHaveLength(1);
      cli("--verify-required");
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
      expect(explain.verificationDetail.process.appliesTo.contractVersion).toBe(1);
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
    task.assessment = computeAssessment(task, ["convex/schema.ts"]);
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("skill");
    task.skills = task.assessment.requiredSkills;
    expect(() => resolveLoopStep({ task, event: "ready", root })).toThrow("verification");
    for (const kind of ["lint", "unit", "build"])
      task.verification[kind] = { head: task.head, baseHead: task.baseHead, success: true };
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
  it("requires reassessment every three rounds and stops at the configured cap", () => {
    const task = taskFixture(root, { state: "review" });
    for (let i = 0; i < 9; i++) {
      task.state = "review";
      if ((i + 1) % 3 === 0)
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
    transitionTask(task, "ci_failure", { reason: "CI failed" }, root);
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
    expect(task.configuration.profile.name).toBe("standard");
    expect(task.configuration).not.toHaveProperty("model");
    expect(task.configuration.selection.source).toBe("provisional");
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
    expect(evidence.appliesTo).toMatchObject({
      head: task.head,
      baseHead: task.baseHead,
      contractVersion: 1,
    });
    expect(evidence.appliesTo.headTree).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.appliesTo.patchSha256).toMatch(/^[0-9a-f]{64}$/);
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
    expect(manifest.appliesTo.contractVersion).toBe(1);
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
      profile: { selected: "standard" },
      openFindings: 0,
    });
    for (const key of ["configuration", "assessment", "history", "spec", "findings"])
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
  it("surfaces refine gaps for missing profile inputs and invalid specs", () => {
    const task = taskFixture(root, { state: "refine" });
    // blast_radius/uncertainty come from the assessment; verification_load has
    // the selection-input fallback — baseline reports no gap.
    expect(summarizeTask(task).missing).toEqual([]);
    delete task.agentAssessment.risk_assessment.blast_radius;
    expect(summarizeTask(task).missing).toContain("profile:risk_assessment.blast_radius");
    // A user-specified profile needs no determination inputs, mirroring the gate.
    task.configuration.selection.source = "user";
    expect(summarizeTask(task).missing).toEqual([]);
    task.configuration.selection.source = "auto";
    task.agentAssessment.risk_assessment.blast_radius = "local";
    task.spec.acceptanceCriteria = [
      { id: "AC1", text: "one" },
      { id: "AC1", text: "duplicate" },
    ];
    expect(summarizeTask(task).missing).toContain("spec:acceptanceCriteria");
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
  it("reuses verification evidence across base drift when the head tree is unchanged", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    const before = task.verification.process;
    upstreamCommit(dir, git, "src/app.ts", "export {};\n");
    const refreshed = refreshTask(loadTask(dir), dir);
    const evidence = refreshed.verification.process;
    // The run record stays at the revision that actually executed it.
    expect(evidence.run.head).toBe(before.run.head);
    expect(evidence.appliesTo.head).toBe(refreshed.head);
    expect(evidence.appliesTo.baseHead).toBe(refreshed.baseHead);
    expect(evidence.appliesTo.baseHead).not.toBe(before.appliesTo.baseHead);
    expect(evidence.reuse).toMatchObject({
      from: { head: before.appliesTo.head, baseHead: before.appliesTo.baseHead },
    });
    expect(verificationSummary(refreshed).process).toBe("pass(reused)");
    expect(refreshed.history.at(-1).reusedVerification).toEqual(["process"]);
  });
  it("keeps evidence when upstream drift leaves the head tree untouched", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    // Even harness-relevant upstream files cannot invalidate a verification of
    // this tree — the head does not contain them.
    upstreamCommit(dir, git, "docs/upstream.md");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.process.reuse).toBeDefined();
    expect(refreshed.history.at(-1).reusedVerification).toEqual(["process"]);
  });
  it("reuses evidence across a message-only amend when the tree is identical", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    git("-c", "core.hooksPath=/dev/null", "commit", "--amend", "-m", "renamed");
    const refreshed = refreshTask(loadTask(dir), dir);
    const evidence = refreshed.verification.process;
    // Same patch, same tree, new commit SHA — evidence carries over.
    expect(evidence.appliesTo.head).toBe(refreshed.head);
    expect(evidence.reuse.from.head).not.toBe(refreshed.head);
    expect(verificationSummary(refreshed).process).toBe("pass(reused)");
  });
  it("drops evidence after a rebase even when the feature patch is identical", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    runVerification(task, "process", dir, () => ({ status: 0 }));
    saveTask(task, dir);
    upstreamCommit(dir, git, "src/upstream.ts", "export {};\n");
    // Rebasing keeps the patch byte-identical but embeds new base content —
    // the head tree differs, so verification must re-run on the new content.
    const beforeSha = task.verification.process.appliesTo.patchSha256;
    git("-c", "core.hooksPath=/dev/null", "rebase", "preview");
    // Prove the patch fingerprint held — the drop below must come from the
    // head-tree fingerprint, not a patch mismatch.
    const afterSha = createHash("sha256")
      .update(
        execFileSync("git", ["diff", "--binary", "--no-renames", "preview...HEAD"], {
          cwd: dir,
          encoding: "utf8",
        }).trim(),
      )
      .digest("hex");
    expect(afterSha).toBe(beforeSha);
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification).toEqual({});
    expect(refreshed.history.at(-1).reusedVerification).toEqual([]);
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
  it("drops evidence fail-closed on contract mismatch or missing reuse metadata", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    task.verification.process.appliesTo.contractVersion = 999;
    saveTask(task, dir);
    upstreamCommit(dir, git, "src/app.ts", "export {};\n");
    expect(refreshTask(loadTask(dir), dir).verification).toEqual({});
    // Legacy flat evidence without appliesTo is never reusable either.
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
  it("never reuses review or aftercare evidence on revision change", () => {
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
    expect(refreshed.verification.process).toBeDefined();
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
    expect(packet.reuseCandidates.featurePatchSha256).toMatch(/^[0-9a-f]{64}$/);
    const template = JSON.parse(readFileSync(path.join(out, "review-template.json"), "utf8"));
    expect(template).toMatchObject({
      head: task.head,
      independent: true,
      context: "fresh",
      findings: [],
    });
    expect(template.acceptanceCriteria).toEqual([{ id: "AC1", evidence: "" }]);
    // _notes carries reviewer-facing contract hints (finding status enum,
    // deltaFrom, machine floor) — its absence caused an invalid status enum
    // in a real fresh-context review.
    expect(template._notes.join(" ")).toContain("open|fixed|dismissed");
    expect(readFileSync(path.join(out, "diff.patch"), "utf8")).toContain("feature.txt");
    const manifest = JSON.parse(readFileSync(path.join(out, "verification-manifest.json"), "utf8"));
    expect(manifest.process.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(readFileSync(path.join(out, "task-summary.json"), "utf8")).state).toBe(
      "review",
    );
    expect(existsSync(path.join(out, "contracts", "workflow-review.md"))).toBe(true);
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
    const prPolls = [prFields([pending]), prFields([pending]), prFields([ok])];
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
    expect(result.task.aftercare.ready).toBe(true);
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
      statusCheckRollup: [{ name: "Agent harness", status: "COMPLETED", conclusion: "SUCCESS" }],
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
    expect(result.events[1]).toMatchObject({ ready: true, changed: true });
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
    expect(revision).toMatchObject({ action: "revision_changed", reused: 1, invalidated: 0 });
  });
});

describe("increment reuse and loop ergonomics", () => {
  /** Move `preview` one commit ahead on the given file, then switch back. */
  const upstreamCommit = (dir, git, file, content = "upstream\n") => {
    git("switch", "preview");
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", `upstream ${file}`);
    git("switch", "codex/task");
  };
  it("extends non-process evidence through metadata-only increments", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    for (const kind of ["lint", "unit", "build"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, "docs"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "note.md"), "docs\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs fix");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.process).toBeUndefined();
    for (const kind of ["lint", "unit", "build"]) {
      const evidence = refreshed.verification[kind];
      expect(evidence.appliesTo.head).toBe(refreshed.head);
      expect(evidence.reuse).toMatchObject({ basis: "metadata_only_increment" });
      expect(evidence.reuse.incrementPaths).toEqual(["docs/note.md"]);
    }
    expect(refreshed.history.at(-1).reusedVerification).toEqual(
      expect.arrayContaining(["lint", "unit", "build"]),
    );
    expect(refreshed.history.at(-1).reusedVerification).not.toContain("process");
  });
  it("does not extend lint evidence when a metadata increment has oxfmt-checked files", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit", "build"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, ".github", "ISSUE_TEMPLATE"), { recursive: true });
    writeFileSync(path.join(dir, ".github", "ISSUE_TEMPLATE", "bug.yml"), "name: bug\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "issue template yaml");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.lint).toBeUndefined();
    for (const kind of ["unit", "build"]) {
      expect(refreshed.verification[kind].reuse).toMatchObject({
        basis: "metadata_only_increment",
      });
      expect(refreshed.verification[kind].appliesTo.head).toBe(refreshed.head);
    }
  });
  it("does not extend lint evidence for extension-bearing files under .husky", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, ".husky"), { recursive: true });
    writeFileSync(path.join(dir, ".husky", "hook.json"), "{}\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "husky json");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.lint).toBeUndefined();
    expect(refreshed.verification.unit.reuse).toMatchObject({
      basis: "metadata_only_increment",
    });
  });
  it("does not extend lint evidence for well-known filenames under .husky", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, ".husky"), { recursive: true });
    writeFileSync(path.join(dir, ".husky", "README"), "# hooks\n");
    writeFileSync(path.join(dir, ".husky", "pre-commit"), "echo lint\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "husky readme + hook");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.lint).toBeUndefined();
    expect(refreshed.verification.unit.reuse).toMatchObject({
      basis: "metadata_only_increment",
    });
  });
  it("extends lint evidence for canonical hook basenames under .husky", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, ".husky"), { recursive: true });
    writeFileSync(path.join(dir, ".husky", "pre-push"), "echo test\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "husky hook");
    const refreshed = refreshTask(loadTask(dir), dir);
    for (const kind of ["lint", "unit"])
      expect(refreshed.verification[kind].reuse).toMatchObject({
        basis: "metadata_only_increment",
      });
  });
  it("drops evidence when an increment touches runtime paths or the base moved", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit", "build"])
      task.verification[kind] = verificationManifestFixture(task, kind);
    saveTask(task, dir);
    mkdirSync(path.join(dir, "docs"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "note.md"), "docs\n");
    writeFileSync(path.join(dir, "scripts", "feature.ts"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs + code");
    expect(refreshTask(loadTask(dir), dir).verification).toEqual({});
  });
  it("does not take the increment path when only the base moved", () => {
    const { dir, git, task } = repository();
    for (const kind of ["lint", "unit"]) runVerification(task, kind, dir, () => ({ status: 0 }));
    saveTask(task, dir);
    upstreamCommit(dir, git, "docs/upstream.md", "upstream\n");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.lint.reuse.basis).toBe("identical_patch_and_tree");
    expect(refreshed.verification.unit.reuse.basis).toBe("identical_patch_and_tree");
  });
  it("keeps verification and assessment through findings and ci_failure transitions", () => {
    const { dir, task } = repository();
    task.verification.process = { head: task.head, baseHead: task.baseHead, success: true };
    task.state = "review";
    task.review = reviewFixture(task, {
      findings: [{ id: "F1", status: "open", evidence: "edge" }],
    });
    task.findings = task.review.findings;
    transitionTask(task, "findings", { reason: "fix F1" }, dir);
    expect(task.state).toBe("execute");
    expect(task.verification.process).toBeDefined();
    expect(task.agentAssessment).toBeTruthy();
    task.state = "aftercare";
    transitionTask(task, "ci_failure", { reason: "lint failed" }, dir);
    expect(task.verification.process).toBeDefined();
    expect(task.agentAssessment).toBeTruthy();
  });
  it("runs vitest related for --scope affected over changed runtime paths", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "src-feature.ts"), "export {};\n");
    mkdirSync(path.join(dir, "e2e"), { recursive: true });
    writeFileSync(path.join(dir, "e2e", "new.spec.ts"), "// playwright\n");
    mkdirSync(path.join(dir, "docs"), { recursive: true });
    writeFileSync(path.join(dir, "docs", "note.md"), "docs\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    const commands = [];
    runVerification(
      task,
      "unit",
      dir,
      (command) => {
        commands.push(command);
        return { status: 0 };
      },
      { scope: "affected" },
    );
    expect(commands).toHaveLength(1);
    expect(commands[0].slice(0, 4)).toEqual(["pnpm", "exec", "vitest", "related"]);
    expect(commands[0]).toContain("src-feature.ts");
    expect(task.verification.unit.run.scope).toBe("affected");
    expect(task.verification.unit.run.affectedFiles).toEqual(["src-feature.ts"]);
  });
  it("falls back to the full suite when no runtime files changed and rejects scope misuse", () => {
    const { dir, task } = repository();
    const commands = [];
    runVerification(
      task,
      "unit",
      dir,
      (command) => {
        commands.push(command);
        return { status: 0 };
      },
      { scope: "affected" },
    );
    expect(commands[0]).toEqual(["pnpm", "exec", "vitest", "run"]);
    expect(task.verification.unit.run.scope).toBe("full");
    expect(() =>
      runVerification(task, "lint", dir, () => ({ status: 0 }), { scope: "affected" }),
    ).toThrow("unit only");
    saveTask(task, dir);
    expect(() => run({ scope: "affected" }, dir)).toThrow("--scope requires --verify");
  });
  it("accepts deltaFrom only for previously reviewed heads", () => {
    const { task } = repository();
    task.state = "review";
    const priorHead = "c".repeat(40);
    task.history.push({
      state: "review",
      event: "review_recorded",
      head: priorHead,
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(() => validateReview(task, reviewFixture(task, { deltaFrom: priorHead }))).not.toThrow();
    for (const bad of ["not-a-sha", task.head, "d".repeat(40)])
      expect(() => validateReview(task, reviewFixture(task, { deltaFrom: bad }))).toThrow(
        "deltaFrom",
      );
  });
  it("reports finding status enums and assessment failures in review errors", () => {
    const { task } = repository();
    task.state = "review";
    expect(() =>
      validateReview(
        task,
        reviewFixture(task, {
          findings: [{ id: "F1", status: "closed", evidence: "done" }],
        }),
      ),
    ).toThrow("open|fixed|dismissed");
    expect(() => validateReview(task, reviewFixture(task, { assessment: undefined }))).toThrow(
      "Reviewer assessment invalid",
    );
  });
  it("keeps metadata-reading tests inside the mandatory process suite", () => {
    // `unit` evidence is extended through metadata-only increments only because
    // every test whose outcome can depend on metadata content runs under the
    // `process` verification that is never extended. This heuristic guard fails
    // loudly when a new metadata-referencing test (or test helper) lands
    // outside the process suite. git pathspec has no brace expansion, so
    // .test/.spec are listed separately; tests/** covers non-test helpers.
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const processTests = new Set(
      pkg.scripts["test:process"].match(/[\w./-]+\.(?:test|spec)\.(?:mjs|ts|tsx|js)/g) ?? [],
    );
    const testFiles = [
      ...new Set(
        execFileSync("git", ["ls-files", "**/*.test.*", "**/*.spec.*", "tests/**"], {
          cwd: root,
          encoding: "utf8",
        })
          .split("\n")
          .filter(Boolean),
      ),
    ];
    // A quoted metadata path literal: whole-literal .md paths including ?raw
    // suffixes and ${} interpolation, plus ISSUE_TEMPLATE/.husky tokens
    // anywhere inside a quoted string. Unquoted property access like
    // `tokens.space.md` and longer prose containing a path do not match.
    const METADATA_PATH_REF =
      /["'`][\w./$*{}-]+\.md(?:\?[^"'`]*)?["'`]|["'`][^"'`]*(?:ISSUE_TEMPLATE|\.husky)[^"'`]*["'`]/;
    const offenders = testFiles.filter(
      (file) =>
        !processTests.has(file) &&
        !file.startsWith("e2e/") &&
        METADATA_PATH_REF.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);

    // Non-test build/unit-reachable code must not read metadata at all: a
    // `?raw` .md import (or a metadata-dir reference) inside src/convex would
    // change build and transitive unit outcomes while evidence is extended.
    // Scripts are exempt — they are process-domain readers by design and their
    // tests already live in the process suite.
    const sourceOffenders = execFileSync("git", ["ls-files", "src/**", "convex/**"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(
        (file) =>
          /\.(?:[cm]?[jt]sx?)$/.test(file) &&
          !/\.(?:test|spec)\.[^.]+$/.test(file) &&
          METADATA_PATH_REF.test(readFileSync(path.join(root, file), "utf8")),
      );
    expect(sourceOffenders).toEqual([]);
  });
  it("records friction notes into task state, history and the state block", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const result = run({ "friction-note": " per-kind verify reruns felt heavy " }, dir);
    expect(result.frictionNote).toBe("per-kind verify reruns felt heavy");
    const saved = loadTask(dir);
    expect(saved.history.at(-1)).toMatchObject({ event: "friction_note" });
    expect(stateBlock(saved)).toContain("per-kind verify");
    expect(() => run({ "friction-note": "   " }, dir)).toThrow("requires non-empty");
  });
  it("records the friction note text (bounded) in the metric line", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const file = path.join(dir, "..", `${path.basename(dir)}-metrics.jsonl`);
    dirs.push(file);
    process.env.AGENT_METRICS_FILE = file;
    try {
      run({ "friction-note": `review packets felt heavy ${"x".repeat(600)}` }, dir);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    const metric = JSON.parse(readFileSync(file, "utf8").trim().split("\n").at(-1));
    expect(metric).toMatchObject({ action: "friction_note" });
    expect(metric.note.startsWith("review packets felt heavy")).toBe(true);
    expect(metric.note).toHaveLength(500);
  });
  it("carries the agent assessment only while the machine classification is unchanged", () => {
    const { dir, git, task } = repository();
    task.skills = ["note-only"];
    writeFileSync(path.join(dir, "notes.md"), "first\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs");
    refreshTask(task, dir);
    expect(task.agentAssessment).toBeTruthy();
    expect(task.skills).toEqual(["note-only"]);
    expect(task.history.at(-1)).toMatchObject({
      event: "revision_changed",
      assessmentCarried: true,
    });
    mkdirSync(path.join(dir, "scripts"), { recursive: true });
    writeFileSync(path.join(dir, "scripts", "loop-extra.mjs"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "harness change");
    refreshTask(task, dir);
    expect(task.agentAssessment).toBeNull();
    expect(task.skills).toEqual([]);
    expect(task.history.at(-1)).toMatchObject({ assessmentCarried: false });
    expect(missingRequirements(task)).toContain("assessment");
  });
  it("never carries an assessment into a task that is back in refine", () => {
    const { dir, git, task } = repository();
    task.state = "refine";
    writeFileSync(path.join(dir, "notes.md"), "first\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs");
    refreshTask(task, dir);
    expect(task.agentAssessment).toBeNull();
  });
  it("accepts affected unit evidence for EXECUTE→REVIEW and completes the full suite in review", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "src-feature.ts"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    // The change became runtime-relevant, so the agent re-submits its assessment.
    expect(task.agentAssessment).toBeNull();
    task.agentAssessment = structuredClone(agentAssessment);
    refreshTask(task, dir);
    task.skills = [...task.assessment.requiredSkills];
    expect(task.assessment.verification.unit).toBe(true);
    const commands = [];
    const runner = (command) => {
      commands.push(command);
      return { status: 0 };
    };
    runRequiredVerification(task, dir, runner);
    const unitCommand = commands.find((command) => command.includes("vitest"));
    expect(unitCommand.slice(0, 4)).toEqual(["pnpm", "exec", "vitest", "related"]);
    expect(unitCommand).toContain("--passWithNoTests");
    expect(task.verification.unit.run.scope).toBe("affected");
    expect(verificationSummary(task).unit).toBe("pass(affected)");
    expect(missingRequirements(task)).toEqual([]);
    transitionTask(task, "ready", {}, dir);
    expect(task.state).toBe("review");
    expect(missingRequirements(task)).toContain("verify:unit(full)");
    task.review = reviewFixture(task);
    expect(() => transitionTask(structuredClone(task), "clean", {}, dir)).toThrow(
      "Full unit verification",
    );
    commands.length = 0;
    runRequiredVerification(task, dir, runner);
    expect(commands).toEqual([["pnpm", "exec", "vitest", "run"]]);
    expect(task.state).toBe("review");
    expect(task.verification.unit.run.scope).toBe("full");
    expect(missingRequirements(task)).not.toContain("verify:unit(full)");
    transitionTask(task, "clean", {}, dir);
    expect(task.state).toBe("aftercare");
  });
  it("excludes the process suite files from the full unit command", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "loop-unit-"));
    dirs.push(parent);
    writeFileSync(
      path.join(parent, "package.json"),
      JSON.stringify({
        scripts: { "test:process": "vitest run scripts/a.test.mjs tests/b.test.ts" },
      }),
    );
    expect(processSuiteFiles(parent)).toEqual(["scripts/a.test.mjs", "tests/b.test.ts"]);
    expect(unitFullCommand(parent)).toEqual([
      [
        "pnpm",
        "exec",
        "vitest",
        "run",
        "--exclude",
        "scripts/a.test.mjs",
        "--exclude",
        "tests/b.test.ts",
      ],
    ]);
    writeFileSync(
      path.join(parent, "package.json"),
      JSON.stringify({ scripts: { "test:process": "node scripts/custom.mjs" } }),
    );
    // An unrecognized script never shrinks the unit suite.
    expect(unitFullCommand(parent)).toEqual([["pnpm", "exec", "vitest", "run"]]);
    // The repository's own process suite is excluded from local unit runs.
    expect(processSuiteFiles(root)).toContain("scripts/loop-runner.test.mjs");
  });
  it("defaults re-review packets to the increment since the latest qualifying review", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "old-feature.txt"), "original\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
      head: prior,
      baseHead: task.baseHead,
      acceptanceCriteria: [{ id: "AC1", evidence: "Reviewed feature" }],
      findings: [{ id: "F1", status: "open", severity: "major", evidence: "Fix needed" }],
    });
    task.findings = [
      { id: "F1", status: "fixed", severity: "major", evidence: "Fixed" },
      { id: "F2", status: "dismissed", evidence: "Out of scope" },
    ];
    writeFileSync(path.join(dir, "fix.txt"), "correction\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "fix");
    refreshTask(task, dir);
    task.state = "review";
    const parent = mkdtempSync(path.join(tmpdir(), "loop-auto-"));
    dirs.push(parent);
    expect(autoDeltaFrom(task, dir)).toBe(prior);
    const auto = buildReviewPacket(task, path.join(parent, "auto"), dir);
    expect(auto.reviewScope).toEqual({ kind: "increment", deltaFrom: prior, selection: "auto" });
    const packet = JSON.parse(readFileSync(path.join(parent, "auto", "packet.json"), "utf8"));
    expect(packet.changedPaths).toEqual(["fix.txt"]);
    expect(packet.reviewScope.selection).toBe("auto");
    const template = JSON.parse(
      readFileSync(path.join(parent, "auto", "review-template.json"), "utf8"),
    );
    expect(template.deltaFrom).toBe(prior);
    expect(template.findings).toEqual([
      { id: "F1", status: "fixed", severity: "major", evidence: "" },
      { id: "F2", status: "dismissed", evidence: "" },
    ]);
    expect(
      buildReviewPacket(task, path.join(parent, "full"), dir, { full: true }).reviewScope,
    ).toEqual({ kind: "full" });
    expect(() =>
      buildReviewPacket(task, path.join(parent, "x"), dir, { full: true, deltaFrom: prior }),
    ).toThrow("conflicts");
    // Ineligible history falls back to a full packet instead of failing.
    task.history.at(-2).baseHead = "f".repeat(40);
    const reviewed = task.history.find((entry) => entry.event === "review_recorded");
    reviewed.baseHead = "f".repeat(40);
    expect(autoDeltaFrom(task, dir)).toBeNull();
    expect(buildReviewPacket(task, path.join(parent, "fallback"), dir).reviewScope).toEqual({
      kind: "full",
    });
    saveTask({ ...task, state: "execute" }, dir);
    expect(() => run({ "full-review": true }, dir)).toThrow("--full-review requires");
  });
  it("validates the optional finding severity", () => {
    const task = taskFixture(root, { state: "review" });
    const finding = { id: "F1", status: "fixed", evidence: "ok" };
    expect(() =>
      validateReview(task, reviewFixture(task, { findings: [{ ...finding, severity: "major" }] })),
    ).not.toThrow();
    expect(() =>
      validateReview(
        task,
        reviewFixture(task, { findings: [{ ...finding, severity: "critical" }] }),
      ),
    ).toThrow("Invalid finding severity");
  });
  it("compacts the published state block while keeping restore and gate references", () => {
    const task = taskFixture(root, { state: "aftercare" });
    const reviewHead = (n) => n.toString(16).padStart(40, "0");
    task.history = Array.from({ length: 30 }, (_, index) => ({
      state: "execute",
      event: "assessed",
      head: reviewHead(index + 1),
      at: "2026-01-01T00:00:00.000Z",
    }));
    const priorFindings = [{ id: "F1", status: "open", evidence: "Needs a fix" }];
    task.history[3] = {
      ...task.history[3],
      event: "review_recorded",
      acceptanceCriteria: [{ id: "AC1", evidence: "Earlier review" }],
      findings: priorFindings,
    };
    task.review = reviewFixture(task, {
      deltaFrom: reviewHead(4),
      findings: [{ id: "F1", status: "fixed", evidence: "Fixed in the increment" }],
    });
    task.findings = structuredClone(task.review.findings);
    task.history[20] = {
      ...task.history[20],
      event: "review_recorded",
      head: task.head,
      acceptanceCriteria: structuredClone(task.review.acceptanceCriteria),
      findings: structuredClone(task.review.findings),
    };
    task.verification.unit = verificationManifestFixture(task, "unit");
    const compact = compactTaskForExport(task);
    expect(compact.assessment).toBeNull();
    expect(compact.verification.unit.summary).toEqual({ exitCode: 0 });
    expect(compact.verification.unit.artifact).toEqual(task.verification.unit.artifact);
    expect(compact.history).toHaveLength(STATE_BLOCK_RECENT_HISTORY + 1);
    // The delta base keeps AC evidence only; the latest review becomes a reference.
    expect(compact.history[0]).toEqual({
      ...task.history[3],
      findings: undefined,
    });
    expect(compact.history[0]).not.toHaveProperty("findings");
    const latest = compact.history.find((entry) => entry.sameAsReview);
    expect(latest).toMatchObject({ event: "review_recorded", head: task.head });
    expect(latest).not.toHaveProperty("findings");
    expect(compact).not.toHaveProperty("findings");
    expect(compact.historyOmitted).toBe(30 - STATE_BLOCK_RECENT_HISTORY - 1);
    // Parsing re-hydrates the references exactly.
    const restored = parseStateBlock(stateBlock(task));
    expect(restored.findings).toEqual(task.findings);
    expect(restored.review).toEqual(task.review);
    expect(restored.history.find((entry) => entry.head === task.head)).toEqual(task.history[20]);
    expect(restored.history[0].acceptanceCriteria).toEqual(task.history[3].acceptanceCriteria);
    expect(() => validateTask(restored, root)).not.toThrow();
    expect(() => validateReview(restored, restored.review)).not.toThrow();
    // Re-publishing a restored snapshot keeps the omitted count cumulative.
    expect(compactTaskForExport(restored).historyOmitted).toBe(compact.historyOmitted);
    expect(task.history).toHaveLength(30);
    expect(stateBlock(task).length).toBeLessThan(JSON.stringify(task, null, 2).length / 2);
    // Findings that differ from the review are kept; a broken reference fails closed.
    expect(compactTaskForExport({ ...task, findings: priorFindings }).findings).toEqual(
      priorFindings,
    );
    const block = (value) =>
      `${STATE_START}\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n${STATE_END}`;
    const broken = compactTaskForExport(task);
    broken.history.find((entry) => entry.sameAsReview).head = "e".repeat(40);
    expect(() => parseStateBlock(block(broken))).toThrow("review reference");
    // Legacy (uncompacted) blocks pass through unchanged.
    expect(parseStateBlock(block(task))).toEqual(task);
  });
  it("reports the current state's workflow in the compact summary", () => {
    const task = taskFixture(root);
    expect(summarizeTask(task).workflow).toBe(".agent/workflow/execute.md");
    expect(summarizeTask({ ...task, state: "done" }).workflow).toBeNull();
  });
  it("records transcript token usage without touching the task", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const original = readFileSync(taskPath(dir), "utf8");
    const transcript = path.join(dir, "..", `${path.basename(dir)}-session.jsonl`);
    const metrics = path.join(dir, "..", `${path.basename(dir)}-usage.jsonl`);
    dirs.push(transcript, metrics);
    const line = (id, usage) =>
      JSON.stringify({ message: { id, role: "assistant", model: "m", usage } });
    writeFileSync(
      transcript,
      [
        line("r1", { input_tokens: 3, cache_read_input_tokens: 10, output_tokens: 5 }),
        line("r1", { input_tokens: 3, cache_read_input_tokens: 10, output_tokens: 5 }),
        line("r2", { input_tokens: 1, cache_creation_input_tokens: 7, output_tokens: 2 }),
      ].join("\n"),
    );
    process.env.AGENT_METRICS_FILE = metrics;
    let result;
    try {
      result = run({ "record-usage": transcript, "usage-role": "reviewer" }, dir);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    expect(result).toMatchObject({
      action: "usage",
      role: "reviewer",
      calls: 2,
      inputUncached: 4,
      cacheRead: 10,
      cacheWrite: 7,
      output: 7,
    });
    expect(JSON.parse(readFileSync(metrics, "utf8").trim())).toMatchObject({
      action: "usage",
      taskId: task.taskId,
      source: path.basename(transcript),
    });
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    expect(() => run({ "record-usage": transcript, "usage-role": "boss" }, dir)).toThrow(
      "--usage-role",
    );
    writeFileSync(transcript, "{}\n");
    expect(() => run({ "record-usage": transcript }, dir)).toThrow("No token usage");
    expect(() => run({ "usage-role": "reviewer" }, dir)).toThrow("requires --record-usage");
  });
});
