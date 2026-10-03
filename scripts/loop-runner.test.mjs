import { afterEach, describe, expect, it } from "vitest";
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
  saveTask,
  loadTask,
  stateBlock,
  parseStateBlock,
  summarizeTask,
  artifactManifest,
  buildReviewPacket,
  watchAftercare,
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
    expect(stale.next).toContain("node scripts/loop-runner.mjs --verify process");
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
    const fetches = [
      { pr: prFields([pending]), findings },
      { pr: prFields([pending]), findings },
      { pr: prFields([ok]), findings },
    ];
    let recorded = false;
    const result = watchAftercare(task, 7, dir, {
      fetch: () => fetches.shift(),
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
      fetch: () => ({ pr: pending, findings: {} }),
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
  it("appends verify and revision metrics to the shared git dir", () => {
    const { dir, git, task } = repository();
    runVerification(task, "process", dir, () => ({ status: 0 }));
    const file = path.join(
      git("rev-parse", "--path-format=absolute", "--git-common-dir"),
      "agent-metrics.jsonl",
    );
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
    refreshTask(loadTask(dir), dir);
    const revision = readMetrics().at(-1);
    expect(revision).toMatchObject({ action: "revision_changed", reused: 1, invalidated: 0 });
  });
});
