import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
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
  saveTask,
  loadTask,
  stateBlock,
  parseStateBlock,
  summarizeTask,
  artifactManifest,
} from "./loop-runner.mjs";
import { taskFixture, reviewFixture, verificationManifestFixture } from "./loop-test-fixtures.mjs";
import { computeAssessment, currentEvidence, verificationSummary } from "./loop-policy.mjs";
const root = process.cwd();
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function repository() {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-test-"));
  dirs.push(dir);
  cpSync(path.join(root, ".agent"), path.join(dir, ".agent"), { recursive: true });
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
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
  git("init", "-b", "preview");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("add", ".");
  git("-c", "core.hooksPath=/dev/null", "commit", "-m", "base");
  const baseHead = git("rev-parse", "HEAD");
  git("switch", "-c", "codex/task");
  const task = taskFixture(dir, { head: baseHead, baseHead, baseRef: "preview" });
  return { dir, git, task };
}
describe("persistent task gates", () => {
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

  it("runs the startup-to-PR path through the real CLI in an isolated worktree", () => {
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
    cli("--verify", "process");
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
    const logPath = artifacts.artifacts.process.artifact.path;
    expect(logPath).toContain("agent-evidence");
    expect(logPath.startsWith(path.join(checkout, ".git"))).toBe(false);
    const stateFile = path.join(parent, "state.md");
    expect(JSON.parse(cli("--export-file", stateFile)).written).toBe(stateFile);
    expect(parseStateBlock(readFileSync(stateFile, "utf8")).state).toBe("aftercare");
  });
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
    expect(parseStateBlock(stateBlock(task))).toEqual(task);
    expect(() => parseStateBlock("no checkpoint")).toThrow();
    expect(() => parseStateBlock(stateBlock(task) + stateBlock(task))).toThrow();
  });
  it("rejects missing CLI option values and unknown options", () => {
    for (const flag of ["--model", "--profile", "--runtime", "--event", "--exit", "--review"])
      expect(() => parseArguments([flag])).toThrow("requires a value");
    expect(() => parseArguments(["--magic"])).toThrow("unknown option");
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
    expect(evidence.appliesTo.patchSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.artifact.path).toContain("agent-evidence");
    expect(evidence.artifact.bytes).toBeGreaterThan(0);
    const log = readFileSync(evidence.artifact.path, "utf8");
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
    expect(stale.next).toContain("node scripts/loop-runner.mjs --verify process");
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
});
