import { afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  STATE_BLOCK_RECENT_HISTORY,
  STATE_END,
  STATE_START,
  STATE_WORKFLOWS,
  acceptanceCriteriaHash,
  autoDeltaFrom,
  buildReviewPacket,
  compactTaskForExport,
  deferredBlock,
  hydrateExportedTask,
  loadTask,
  parseStateBlock,
  readChangedPathsRevisioned,
  refreshTask,
  resolveLoopStep,
  run,
  runRequiredVerification,
  runVerification,
  saveTask,
  stateBlock,
  summarizeTask,
  taskPath,
  transitionTask,
} from "../loop-runner.mjs";
import {
  agentAssessment,
  reviewFixture,
  taskFixture,
  verificationManifestFixture,
} from "../loop-test-fixtures.mjs";
import {
  missingRequirements,
  processSuiteExcludes,
  processSuiteFiles,
  unitFullCommand,
  validateReview,
  validateTask,
  verificationSummary,
} from "../loop-policy.mjs";
import path from "node:path";
import YAML from "yaml";
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

describe("revision invalidation and loop ergonomics", () => {
  /** Move `preview` one commit ahead on the given file, then switch back. */
  const upstreamCommit = (dir, git, file, content = "upstream\n") => {
    git("switch", "preview");
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", `upstream ${file}`);
    git("switch", "codex/task");
  };
  it("memoizes committed paths per (baseHead, head) while re-reading worktree paths", () => {
    const { dir, git } = repository();
    const baseHead = git("rev-parse", "preview");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src/a.ts"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "a");
    const h1 = git("rev-parse", "HEAD");
    expect(readChangedPathsRevisioned(dir, baseHead, h1)).toEqual(["src/a.ts"]);
    // Worktree edits are never served from the committed-diff memo.
    writeFileSync(path.join(dir, "src/b.ts"), "export {};\n");
    expect(readChangedPathsRevisioned(dir, baseHead, h1)).toEqual(["src/a.ts", "src/b.ts"]);
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "b");
    const h2 = git("rev-parse", "HEAD");
    // The new head resolves the committed diff afresh (no stale h1 result).
    expect(readChangedPathsRevisioned(dir, baseHead, h2)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(readChangedPathsRevisioned(dir, baseHead, h1)).toEqual(["src/a.ts"]);
  });
  it("invalidates verification when the base ref advances to include head", () => {
    const { dir, git, task } = repository();
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "src/a.ts"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feat");
    task.head = git("rev-parse", "HEAD");
    runVerification(task, "process", dir, () => ({ status: 0 }));
    expect(task.verification.process.appliesTo.head).toBe(task.head);
    saveTask(task, dir);
    // preview fast-forwards to head: the recorded base no longer matches and
    // evidence invalidates.
    git("switch", "preview");
    git("merge", "--ff-only", "codex/task");
    git("switch", "codex/task");
    const refreshed = refreshTask(loadTask(dir), dir);
    expect(refreshed.verification.process).toBeUndefined();
  });
  it("drops all evidence on any increment, metadata-only or not (#953)", () => {
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
    // No kind extends through an increment — every record invalidates.
    expect(refreshed.verification).toEqual({});
    expect(refreshed.history.at(-1).event).toBe("revision_changed");
    expect(refreshed.history.at(-1)).not.toHaveProperty("reusedVerification");
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
    transitionTask(task, "ci_failure", ciFailureExit(), dir);
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
  it("AC1: nit/minor findings deferred with a follow-up issue do not block clean", () => {
    const task = taskFixture();
    task.state = "review";
    const followUp = "https://github.com/hondasports/kakeibo/issues/999";
    task.review = reviewFixture(task, {
      findings: [
        { id: "F1", severity: "nit", status: "deferred", evidence: "naming", followUp },
        { id: "F2", severity: "minor", status: "deferred", evidence: "dup", followUp },
        { id: "F3", severity: "major", status: "fixed", evidence: "done" },
      ],
    });
    task.findings = structuredClone(task.review.findings);
    expect(() => validateReview(task, task.review)).not.toThrow();
    expect(resolveLoopStep({ task, event: "clean", root }).nextState).toBe("aftercare");
    expect(missingRequirements(task)).toEqual([]);
  });
  it("AC2-AC4: major or severity-less deferred findings and bad follow-up URLs are rejected", () => {
    const task = taskFixture();
    task.state = "review";
    const followUp = "https://github.com/hondasports/kakeibo/issues/999";
    const deferred = (extra) =>
      reviewFixture(task, {
        findings: [{ id: "F1", status: "deferred", evidence: "postpone", followUp, ...extra }],
      });
    // AC2: major (or blocker) cannot be deferred.
    for (const severity of ["major", "blocker"])
      expect(() => validateReview(task, deferred({ severity }))).toThrow("minor/nit");
    // AC3: an omitted severity counts as major and cannot be deferred either.
    expect(() => validateReview(task, deferred({}))).toThrow("minor/nit");
    // AC4: deferred needs a real issue URL.
    for (const badUrl of [
      undefined,
      "https://github.com/hondasports/kakeibo/pull/999",
      "https://example.com/issues/1",
      "not-a-url",
      "https://github.com/hondasports/kakeibo/issues/",
    ])
      expect(() => validateReview(task, deferred({ severity: "nit", followUp: badUrl }))).toThrow(
        "followUp",
      );
    // open minor/nit findings still block clean exactly like before.
    task.review = deferred({ severity: "nit" });
    task.review.findings[0].status = "open";
    task.findings = task.review.findings;
    expect(missingRequirements(task)).toContain("finding:F1");
  });
  it("AC6: deferred findings export with the state block and legacy blocks without them stay compatible", () => {
    const task = taskFixture();
    task.findings = [
      {
        id: "F1",
        severity: "nit",
        status: "deferred",
        evidence: "cosmetic",
        followUp: "https://github.com/hondasports/kakeibo/issues/999",
      },
      { id: "F2", severity: "major", status: "fixed", evidence: "done" },
    ];
    const exported = compactTaskForExport(task);
    expect(exported.deferredFindings).toEqual([
      { id: "F1", severity: "nit", followUp: "https://github.com/hondasports/kakeibo/issues/999" },
    ]);
    expect(deferredBlock(task)).toContain("issues/999");
    expect(deferredBlock(taskFixture())).toBe("");
    // Round-trip keeps the list; a legacy block without the key hydrates fine.
    expect(parseStateBlock(stateBlock(task)).deferredFindings).toEqual(exported.deferredFindings);
    const { deferredFindings: _dropped, ...legacy } = exported;
    expect(legacy.deferredFindings).toBeUndefined();
    expect(() => hydrateExportedTask(structuredClone(legacy))).not.toThrow();
    expect(() => validateTask(hydrateExportedTask(structuredClone(legacy)))).not.toThrow();
  });
  it("restores legacy state blocks carrying removed reuse/lane fields (#953 AC5)", () => {
    // Pre-#953 blocks may carry verification.<kind>.reuse and `lane` — the
    // loader ignores them instead of erroring, and they never come back out.
    const legacy = compactTaskForExport(taskFixture());
    legacy.lane = "lite";
    legacy.assessment = { ...structuredClone(taskFixture().assessment), lane: "lite" };
    legacy.verification.process.reuse = {
      basis: "legacy_reuse_basis",
      from: { head: "0".repeat(40), baseHead: "9".repeat(40) },
      at: "2026-01-01T00:00:00.000Z",
    };
    const hydrated = parseStateBlock(
      `${STATE_START}\n\`\`\`json\n${JSON.stringify(legacy)}\n\`\`\`\n${STATE_END}`,
    );
    expect(hydrated.lane).toBeUndefined();
    expect(hydrated.assessment).not.toHaveProperty("lane");
    expect(hydrated.verification.process.reuse).toBeUndefined();
    expect(() => validateTask(hydrated)).not.toThrow();
    expect(compactTaskForExport(hydrated).verification.process.reuse).toBeUndefined();
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
  it("#952: T2 runs process only locally — prepush gates ready and CI evidence gates clean", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "src-feature.ts"), "export {};\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    refreshTask(task, dir);
    // The change became runtime-relevant, so the agent re-submits its assessment.
    expect(task.agentAssessment).toBeNull();
    task.agentAssessment = { ...structuredClone(agentAssessment), applied_tier: "T2" };
    refreshTask(task, dir);
    task.risk = "T2";
    task.skills = [...task.assessment.requiredSkills];
    // requiredVerificationKinds is `process` alone on the unified lane (#952).
    const commands = [];
    const runner = (command) => {
      commands.push(command);
      return { status: 0 };
    };
    runRequiredVerification(task, dir, runner);
    expect(task.verification.unit).toBeUndefined();
    expect(missingRequirements(task)).toEqual([]);
    expect(() => transitionTask(task, "ready", {}, dir)).toThrow(/verify:prepush/);
    const marker = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", `agent-prepush/${task.head}.ok`],
      { cwd: dir, encoding: "utf8" },
    ).trim();
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, "ok\n");
    transitionTask(task, "ready", {}, dir);
    expect(task.state).toBe("review");
    task.review = reviewFixture(task);
    expect(() => transitionTask(structuredClone(task), "clean", {}, dir)).toThrow(
      /CI review evidence/,
    );
    task.reviewCi = { ok: true, head: task.head, baseHead: task.baseHead };
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
    expect(processSuiteExcludes(parent)).toEqual([]);
    // The repository's own process suite is excluded from local unit runs.
    expect(processSuiteFiles(root)).toContain("scripts/loop/state.test.mjs");
  });
  it("defaults re-review packets to the increment since the latest qualifying review", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "old-feature.txt"), "original\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    const prior = git("rev-parse", "HEAD");
    task.history.push({
      event: "review_recorded",
      ...eligibleReview(task),
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
      { id: "F1", status: "fixed", severity: "major", evidence: "TODO" },
      { id: "F2", status: "dismissed", evidence: "TODO" },
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
    const recorded = JSON.parse(readFileSync(metrics, "utf8").trim());
    expect(recorded).toMatchObject({
      action: "usage",
      taskId: task.taskId,
      source: path.basename(transcript),
    });
    // sourceId is a stable 16-hex path digest: same path → same id, and no
    // local path is written to the metrics log.
    expect(recorded.sourceId).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(recorded)).not.toContain(path.dirname(transcript));
    process.env.AGENT_METRICS_FILE = metrics;
    try {
      expect(run({ "record-usage": transcript }, dir).sourceId).toBe(recorded.sourceId);
      const twin = path.join(dir, "..", `${path.basename(dir)}-twin`);
      dirs.push(twin);
      mkdirSync(twin, { recursive: true });
      const sameName = path.join(twin, path.basename(transcript));
      writeFileSync(sameName, readFileSync(transcript));
      expect(run({ "record-usage": sameName }, dir).sourceId).not.toBe(recorded.sourceId);
    } finally {
      delete process.env.AGENT_METRICS_FILE;
    }
    expect(readFileSync(taskPath(dir), "utf8")).toBe(original);
    expect(() => run({ "record-usage": transcript, "usage-role": "boss" }, dir)).toThrow(
      "--usage-role",
    );
    writeFileSync(transcript, "{}\n");
    expect(() => run({ "record-usage": transcript }, dir)).toThrow("No token usage");
    expect(() => run({ "usage-role": "reviewer" }, dir)).toThrow("requires --record-usage");
  });
  it("never narrows a review onto a base that did not meet the current bar", () => {
    const { dir, git, task } = repository();
    writeFileSync(path.join(dir, "feature.txt"), "feature\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "feature");
    const prior = git("rev-parse", "HEAD");
    const entry = {
      event: "review_recorded",
      head: prior,
      baseHead: task.baseHead,
      acceptanceCriteria: [{ id: "AC1", evidence: "Reviewed" }],
      findings: [],
      ...eligibleReview(task),
      risk: "T1",
    };
    task.history.push(entry);
    writeFileSync(path.join(dir, "fix.txt"), "fix\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "fix");
    refreshTask(task, dir);
    task.state = "review";
    task.risk = "T3";
    task.assessment.review.independent = true;
    const parent = mkdtempSync(path.join(tmpdir(), "loop-bar-"));
    dirs.push(parent);
    const packet = (name, options) =>
      buildReviewPacket(task, path.join(parent, name), dir, options);
    // Lower tier than the current risk.
    expect(autoDeltaFrom(task, dir)).toBeNull();
    expect(packet("tier").reviewScope).toEqual({ kind: "full" });
    expect(() => packet("tier-x", { deltaFrom: prior })).toThrow("below the current risk tier");
    // Same tier but a self-review while independence is required.
    entry.risk = "T3";
    entry.independent = false;
    expect(autoDeltaFrom(task, dir)).toBeNull();
    expect(() => packet("indep-x", { deltaFrom: prior })).toThrow("not an independent");
    // Independent, but the acceptance criteria text changed since.
    entry.independent = true;
    task.spec.acceptanceCriteria[0].text = "Task works differently";
    expect(autoDeltaFrom(task, dir)).toBeNull();
    expect(() => packet("ac-x", { deltaFrom: prior })).toThrow("different spec");
    task.spec.acceptanceCriteria[0].text = "Task works";
    task.spec.assumptions = ["A new assumption"];
    expect(autoDeltaFrom(task, dir)).toBeNull();
    task.spec.assumptions = [];
    // A newer ineligible record does not hide an older eligible base.
    task.history.push({ ...entry, head: task.baseHead, independent: false });
    expect(autoDeltaFrom(task, dir)).toBe(prior);
    task.history.pop();
    // Legacy records without these fields fail closed.
    task.spec.acceptanceCriteria[0].text = "Task works";
    delete entry.acHash;
    expect(autoDeltaFrom(task, dir)).toBeNull();
    entry.acHash = acceptanceCriteriaHash(task.spec);
    expect(autoDeltaFrom(task, dir)).toBe(prior);
  });
  it("records independence, tier and AC fingerprint with each review", () => {
    const { dir, task } = repository();
    task.state = "review";
    saveTask(task, dir);
    const file = path.join(dir, "..", `${path.basename(dir)}-review.json`);
    dirs.push(file);
    writeFileSync(file, JSON.stringify(reviewFixture(task)));
    run({ review: file }, dir);
    expect(loadTask(dir).history.at(-1)).toMatchObject({
      event: "review_recorded",
      independent: true,
      risk: "T1",
      acHash: acceptanceCriteriaHash(task.spec),
    });
  });
  it("refuses to save over task state another runner changed since it was loaded", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const mine = loadTask(dir);
    const other = JSON.parse(readFileSync(taskPath(dir), "utf8"));
    other.attempt = 7;
    writeFileSync(taskPath(dir), `${JSON.stringify(other, null, 2)}\n`);
    expect(() => saveTask(mine, dir)).toThrow("changed by another runner");
    expect(loadTask(dir).attempt).toBe(7);
    saveTask(loadTask(dir), dir);
  });
  it("parses test:process linearly and disables exclusions for options or globs", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "loop-parse-"));
    dirs.push(parent);
    const write = (script) =>
      writeFileSync(
        path.join(parent, "package.json"),
        JSON.stringify({ scripts: { "test:process": script } }),
      );
    const files = Array.from({ length: 30 }, (_, index) => `scripts/f${index}.test.mjs`);
    write(`vitest run  ${files.join(" \t ")} `);
    const started = Date.now();
    expect(processSuiteFiles(parent)).toEqual(files);
    expect(Date.now() - started).toBeLessThan(500);
    for (const script of [
      "vitest run --config other.ts scripts/a.test.mjs",
      "vitest run scripts/**/*.test.mjs",
      "vitest run 'scripts/a.test.mjs'",
      "vitest run",
      "vitest scripts/a.test.mjs",
    ]) {
      write(script);
      expect(processSuiteFiles(parent)).toEqual([]);
    }
  });
  it("hands collected external findings to the independent reviewer in the packet", () => {
    const { dir, git, task } = repository();
    mkdirSync(path.join(dir, "skills", "prompt-injection-guard"), { recursive: true });
    writeFileSync(path.join(dir, "skills", "prompt-injection-guard", "SKILL.md"), "guard\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "guard skill");
    refreshTask(task, dir);
    task.state = "review";
    const parent = mkdtempSync(path.join(tmpdir(), "loop-ext-"));
    dirs.push(parent);
    const external = path.join(parent, "external.json");
    writeFileSync(
      external,
      `PR_FINDINGS status: PASS\n${JSON.stringify({ unhandledCount: 1, findings: [{ id: "CR-1" }] })}`,
    );
    buildReviewPacket(task, path.join(parent, "packet"), dir, { externalFindings: external });
    expect(
      JSON.parse(readFileSync(path.join(parent, "packet", "external-findings.json"), "utf8")),
    ).toMatchObject({ untrusted: true, collected: { unhandledCount: 1 } });
    expect(
      existsSync(
        path.join(parent, "packet", "contracts", "required-skills", "prompt-injection-guard.md"),
      ),
    ).toBe(true);
    expect(
      JSON.parse(readFileSync(path.join(parent, "packet", "packet.json"), "utf8")).externalFindings,
    ).toBe("external-findings.json");
    writeFileSync(external, "not json");
    expect(() =>
      buildReviewPacket(task, path.join(parent, "bad"), dir, { externalFindings: external }),
    ).toThrow("--external-findings");
    saveTask({ ...task, state: "execute" }, dir);
    expect(() => run({ "external-findings": external }, dir)).toThrow("requires --review-packet");
  });
  it("keeps the summary workflow map in sync with process.yaml", () => {
    const config = YAML.parse(readFileSync(path.join(root, ".agent/process.yaml"), "utf8"));
    const fromProcess = Object.fromEntries(
      Object.entries(config.states)
        .filter(([, state]) => state.workflow)
        .map(([name, state]) => [name, state.workflow]),
    );
    expect(STATE_WORKFLOWS).toEqual(fromProcess);
  });
  it("labels affected-scope unit evidence so the full-suite gap stays visible", () => {
    const task = taskFixture(root);
    task.assessment.verification.unit = true;
    task.verification.unit = {
      ...verificationManifestFixture(task, "unit"),
      run: { head: task.head, baseHead: task.baseHead, scope: "affected" },
    };
    expect(verificationSummary(task).unit).toBe("pass(affected)");
    expect(task.assessment.verificationPlan.find((plan) => plan.kind === "unit").scope).toContain(
      "excluding test:process",
    );
  });
});
