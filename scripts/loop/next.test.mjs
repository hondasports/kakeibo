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
  cliCommandName,
  ensureTaskPr,
  loadTask,
  parseArguments,
  run,
  saveTask,
  taskPath,
} from "../loop-runner.mjs";
import { agentAssessment, reviewFixture, taskFixture } from "../loop-test-fixtures.mjs";
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
/** #958: ci_failure遷移に必須のexit（reason+ciFailure+reproduction）のfixture。 */
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

describe("--next auto-advance (#950)", () => {
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
  const markPrepush = (dir, head) => {
    const marker = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", `agent-prepush/${head}.ok`],
      { cwd: dir, encoding: "utf8" },
    ).trim();
    mkdirSync(path.dirname(marker), { recursive: true });
    writeFileSync(marker, "ok\n");
  };
  const ghMock =
    (calls = []) =>
    (argv) => {
      calls.push(argv.join(" "));
      if (argv[0] === "pr" && argv[1] === "list") return "[]";
      if (argv[0] === "pr" && argv[1] === "create") {
        // 実ghはURLだけを返す（--json非対応）。body-fileも読んで検証する。
        const bodyFile = argv[argv.indexOf("--body-file") + 1];
        const body = readFileSync(bodyFile, "utf8");
        expect(body).toContain("publish: false");
        // CIのupdate-spec validatorはreasonをYAML parseする — コロン入り文は
        // クオート必須（実際に #977 で「Nested mappings」エラーが出た）。
        expect(body).toMatch(/reason: "/);
        return "https://github.com/o/r/pull/7";
      }
      if (argv[0] === "pr" && argv[1] === "view")
        return JSON.stringify({ body: "PR body", headRefOid: null, baseRefOid: null });
      if (argv[0] === "api" && argv[1].includes("comments")) return "[]";
      return "{}";
    };
  it("refine stops on a missing assessment and on an invalid spec without transitioning", () => {
    const { dir, task } = repository();
    task.state = "refine";
    task.agentAssessment = null;
    saveTask(task, dir);
    const noAssessment = run({ next: true }, dir, {});
    expect(noAssessment.state).toBe("refine");
    expect(noAssessment.needs).toBe("assessment");
    expect(loadTask(dir).state).toBe("refine");
    const withAssessment = loadTask(dir);
    withAssessment.agentAssessment = structuredClone(agentAssessment);
    withAssessment.spec.openMaterialDecisions = ["product-facing decision pending"];
    saveTask(withAssessment, dir);
    const undecided = run({ next: true }, dir, {});
    expect(undecided.needs).toBe("decisions");
    expect(undecided.missing).toContain("openMaterialDecisions");
  });
  it("refine with a complete spec transitions to execute and asks for implementation", () => {
    const { dir, task } = repository();
    task.state = "refine";
    saveTask(task, dir);
    const result = run({ next: true }, dir, {});
    expect(result.needs).toBe("implementation");
    expect(result.steps).toEqual(["ready"]);
    expect(loadTask(dir).state).toBe("execute");
  });
  it("execute stops on a dirty tree", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    writeFileSync(path.join(dir, "dirty.txt"), "dirty");
    const result = run({ next: true }, dir, {});
    expect(result.needs).toBe("commit");
    expect(loadTask(dir).state).toBe("execute");
  });
  it("AC3: prAllowed=false executes locally but never pushes or creates a PR", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const ghCalls = [];
    const pushed = [];
    const result = run({ next: true }, dir, {
      gh: ghMock(ghCalls),
      push: (branch) => pushed.push(branch),
      verifyPrepush: () => {
        markPrepush(dir, task.head);
        return { status: 0 };
      },
      runVerification: () => ({ status: 0 }),
    });
    expect(result.needs).toBe("pr_permission");
    expect(pushed).toEqual([]);
    expect(ghCalls.filter((call) => call.startsWith("pr create"))).toEqual([]);
    expect(loadTask(dir).state).toBe("review");
  });
  it("AC1: a T1 docs task reaches done in ~4 --next calls", () => {
    const { dir, git, task } = repository();
    task.state = "refine";
    task.spec.prAllowed = true;
    saveTask(task, dir);
    const calls = [];
    const gh = (argv) => {
      calls.push(argv.join(" "));
      if (argv[0] === "pr" && argv[1] === "list") return JSON.stringify([{ number: 7 }]);
      if (argv[0] === "pr" && argv[1] === "create") return JSON.stringify({ number: 7 });
      if (argv[0] === "pr" && argv[1] === "view")
        return JSON.stringify({
          body: "PR body",
          headRefOid: loadTask(dir).head,
          baseRefOid: loadTask(dir).baseHead,
        });
      if (argv[0] === "api") return "[]";
      return "{}";
    };
    const services = {
      gh,
      push: () => {},
      verifyPrepush: () => {
        markPrepush(dir, git("rev-parse", "HEAD"));
        return { status: 0 };
      },
      runVerification: () => ({ status: 0 }),
      // Fresh head on every poll: the docs commit replaces task.head mid-test.
      fetchPr: () => delivery(loadTask(dir)),
      fetchFindings: () => completeFindings,
      sleep: () => {},
      remoteUrl: "git@github.com:o/r.git",
    };
    // 1: refine -> execute
    expect(run({ next: true }, dir, services).needs).toBe("implementation");
    writeFileSync(path.join(dir, "README.md"), "# docs update\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "docs");
    // 2: execute -> review + packet
    const second = run({ next: true }, dir, services);
    expect(second.needs).toBe("review");
    expect(second.packet.dir).toBeTruthy();
    expect(loadTask(dir).state).toBe("review");
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "r.json");
    dirs.push(path.dirname(reviewFile));
    writeFileSync(reviewFile, JSON.stringify(reviewFixture(loadTask(dir))));
    // 3: --next --review -> aftercare
    const third = run({ next: true, review: reviewFile }, dir, services);
    expect(third.needs).toBe("aftercare");
    expect(loadTask(dir).state).toBe("aftercare");
    // 4: aftercare -> done
    const done = run({ next: true }, dir, services);
    expect(done.done).toBe(true);
    const finished = loadTask(dir);
    expect(finished.state).toBe("done");
    // AC2: --next never fires judgment events (decision_required / resolved /
    // human-gate release / ci_failure) — only ready/findings/clean transition.
    expect(
      finished.history.filter((entry) =>
        ["decision_required", "resolved", "ci_failure"].includes(entry.event),
      ),
    ).toEqual([]);
    // AC9: the mechanical phase costs 4 runner invocations end to end —
    // the g1-docs baseline for the same T1 docs lifecycle was 15 commands.
    // (init/draft/assessment submissions are identical on both paths.)
  });
  it("AC5: a prepush failure stops and the next run resumes without re-doing earlier steps", () => {
    const { dir, task } = repository();
    task.spec.prAllowed = true;
    saveTask(task, dir);
    let prepushStatus = 1;
    const services = {
      gh: ghMock(),
      push: () => {},
      verifyPrepush: () => {
        if (prepushStatus === 0) markPrepush(dir, task.head);
        return { status: prepushStatus, stdout: "step lint failed" };
      },
      runVerification: () => ({ status: 0 }),
    };
    const failed = run({ next: true }, dir, services);
    expect(failed.needs).toBe("verify:prepush");
    expect(failed.outputTail).toContain("lint");
    expect(loadTask(dir).state).toBe("execute");
    prepushStatus = 0;
    const resumed = run({ next: true }, dir, services);
    expect(resumed.needs).toBe("review");
    expect(resumed.steps.slice(0, 3)).toEqual(["clean", "verify:prepush", "verify"]);
    expect(loadTask(dir).state).toBe("review");
  });
  it("unresolved ciFailure records run the recheck and stop ci_reproduce when still failing", () => {
    const { dir, task } = repository();
    task.ciFailures = [
      {
        check: "Test",
        head: task.head,
        failedTests: [],
        reproduce: "pnpm test:process",
        recordedAt: "2026-01-01T00:00:00.000Z",
        resolvedAt: null,
      },
    ];
    markPrepush(dir, task.head);
    saveTask(task, dir);
    const result = run({ next: true }, dir, { verifyPrepush: () => ({ status: 1 }) });
    expect(result.needs).toBe("ci_reproduce");
    expect(result.ciFailures).toHaveLength(1);
    const resolved = run({ next: true }, dir, {
      verifyPrepush: () => ({ status: 0 }),
      runVerification: () => ({ status: 0 }),
      gh: ghMock(),
    });
    expect(resolved.needs).toBe("pr_permission");
    expect(loadTask(dir).ciFailures[0].resolvedAt).toBeTruthy();
  });
  it("review without --review emits a packet and reports the independent-review requirement", () => {
    const { dir, task } = repository();
    task.state = "review";
    task.risk = "T2";
    task.agentAssessment.applied_tier = "T2";
    task.agentAssessment.risk_assessment.uncertainty = "some_unknowns";
    saveTask(task, dir);
    const result = run({ next: true }, dir, {});
    expect(result.needs).toBe("review");
    expect(result.independent).toBe(true);
    expect(loadTask(dir).assessment.review.independent).toBe(true);
    expect(existsSync(path.join(result.packet.dir, "diff.patch"))).toBe(true);
    expect(result.pr).toBeNull();
  });
  it("--next --review with open findings transitions via findings and stops for fixes", () => {
    const { dir, task } = repository();
    task.state = "review";
    saveTask(task, dir);
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "r.json");
    dirs.push(path.dirname(reviewFile));
    writeFileSync(
      reviewFile,
      JSON.stringify(
        reviewFixture(task, {
          findings: [
            { id: "f-1", severity: "nit", status: "open", evidence: "rename helper" },
            { id: "f-2", severity: "nit", status: "fixed", evidence: "done" },
          ],
        }),
      ),
    );
    const result = run({ next: true, review: reviewFile }, dir, {
      runVerification: () => ({ status: 0 }),
    });
    expect(result.needs).toBe("fix");
    expect(result.findings).toEqual(["f-1"]);
    const updated = loadTask(dir);
    expect(updated.state).toBe("execute");
    expect(updated.counters.review).toBe(1);
  });
  it("--next --review stops for the reassessment judgment when the 2nd round requires it", () => {
    const { dir, task } = repository();
    task.state = "review";
    task.counters.review = 1; // findings now would be the 2nd round -> reassessment required
    saveTask(task, dir);
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "r.json");
    dirs.push(path.dirname(reviewFile));
    writeFileSync(
      reviewFile,
      JSON.stringify(
        reviewFixture(task, {
          findings: [{ id: "f-1", severity: "minor", status: "open", evidence: "x" }],
        }),
      ),
    );
    const result = run({ next: true, review: reviewFile }, dir, {
      runVerification: () => ({ status: 0 }),
    });
    expect(result.needs).toBe("reassessment");
    expect(result.command).toContain("--event findings");
    expect(loadTask(dir).state).toBe("review");
  });
  it("--next --review clean transitions to aftercare", () => {
    const { dir, task } = repository();
    task.state = "review";
    saveTask(task, dir);
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "r.json");
    dirs.push(path.dirname(reviewFile));
    writeFileSync(reviewFile, JSON.stringify(reviewFixture(task)));
    const result = run({ next: true, review: reviewFile }, dir, {
      runVerification: () => ({ status: 0 }),
    });
    expect(result.needs).toBe("aftercare");
    expect(loadTask(dir).state).toBe("aftercare");
  });
  it("aftercare syncs, marks ready, watches, transitions to done and publishes metrics", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.aftercare = { pr: 7, checkedAt: "2026-01-01T00:00:00.000Z", ready: false };
    saveTask(task, dir);
    const ghCalls = [];
    let drafted = true;
    const gh = (argv) => {
      ghCalls.push(argv.join(" "));
      if (argv[0] === "pr" && argv[1] === "ready") drafted = false;
      if (argv[0] === "pr" && argv[1] === "view")
        return JSON.stringify({
          body: "PR body",
          headRefOid: task.head,
          baseRefOid: task.baseHead,
        });
      if (argv[0] === "api") return "[]";
      return "{}";
    };
    const result = run({ next: true }, dir, {
      gh,
      fetchPr: () => delivery(task, { isDraft: drafted }),
      fetchFindings: () => completeFindings,
      sleep: () => {},
      remoteUrl: "git@github.com:o/r.git",
    });
    expect(result.done).toBe(true);
    expect(loadTask(dir).state).toBe("done");
    expect(ghCalls.some((call) => call.startsWith("pr edit"))).toBe(true);
    expect(ghCalls.some((call) => call.startsWith("pr ready"))).toBe(true);
    // draft中のsync-pr(edited)が Agent harness を SKIPPED にし、そのrunが
    // ready_for_reviewの成功runより新しくselectChecksの正本になるのを防ぐため、
    // ready化はsync-prより先に行う。
    expect(ghCalls.findIndex((call) => call.startsWith("pr ready"))).toBeLessThan(
      ghCalls.findIndex((call) => call.startsWith("pr edit")),
    );
    expect(ghCalls.some((call) => call.startsWith("api repos/o/r/issues/7/comments"))).toBe(true);
  });
  it("AC7: an aftercare CI failure stops with ci_reproduce and the reproduce command", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.aftercare = { pr: 7 };
    saveTask(task, dir);
    const gh = (argv) => {
      if (argv[0] === "pr" && argv[1] === "view")
        return JSON.stringify({
          body: "PR body",
          headRefOid: task.head,
          baseRefOid: task.baseHead,
        });
      return "{}";
    };
    const failing = {
      name: "Test",
      status: "COMPLETED",
      conclusion: "FAILURE",
      detailsUrl: "https://github.com/o/r/actions/runs/1/job/2",
    };
    const result = run({ next: true }, dir, {
      gh,
      fetchPr: () =>
        delivery(task, {
          statusCheckRollup: [
            ...delivery(task).statusCheckRollup.filter((c) => c.name !== "Test"),
            failing,
          ],
        }),
      fetchFindings: () => completeFindings,
      sleep: () => {},
      maxSeconds: 1,
      remoteUrl: "git@github.com:o/r.git",
    });
    expect(result.needs).toBe("ci_reproduce");
    // F5: AC7の失敗レコードは再現に必要な項目を揃えて返す。
    expect(result.ciFailures[0].check).toBe("Test");
    expect(result.ciFailures[0].reproduce).toBeTruthy();
    expect(result.watch.failed).toContain("Test");
    expect(loadTask(dir).state).toBe("aftercare");
  });
  it("pr create output falls back to re-listing when it is not a URL or JSON", () => {
    const { dir, task } = repository();
    task.state = "review";
    task.spec.prAllowed = true;
    saveTask(task, dir);
    let created = 0;
    const gh = (argv) => {
      if (argv[0] === "pr" && argv[1] === "list")
        return created ? JSON.stringify([{ number: 9 }]) : "[]";
      if (argv[0] === "pr" && argv[1] === "create") {
        created += 1;
        return "unexpected output";
      }
      if (argv[0] === "api") return "[]";
      return "{}";
    };
    const result = run({ next: true }, dir, {
      gh,
      push: () => {},
      fetchFindings: () => ({ findings: [] }),
    });
    expect(created).toBe(1);
    expect(result.needs).toBe("review");
    expect(result.pr).toBe(9);
    expect(result.steps).toContain("pr");
  });
  it("a review-state task with prAllowed still creates the missing draft PR before packet (resume)", () => {
    const { dir, task } = repository();
    task.state = "review";
    task.spec.prAllowed = true;
    saveTask(task, dir);
    let pushed = 0;
    let created = 0;
    const gh = (argv) => {
      if (argv[0] === "pr" && argv[1] === "list")
        return created ? JSON.stringify([{ number: 11 }]) : "[]";
      if (argv[0] === "pr" && argv[1] === "create") {
        created += 1;
        return "https://github.com/o/r/pull/11";
      }
      if (argv[0] === "api") return "[]";
      return "{}";
    };
    const result = run({ next: true }, dir, {
      gh,
      push: () => {
        pushed += 1;
      },
      fetchFindings: () => ({ findings: [] }),
    });
    expect(pushed).toBe(1);
    expect(result.needs).toBe("review");
    expect(result.pr).toBe(11);
    // packet still built — the missing PR does not block review packaging.
    expect(result.packet.dir).toContain("agent-review");
  });
  it("gh pr create strips a remote prefix from stored baseRef (F3)", () => {
    const { dir, git: fxGit, task } = repository();
    fxGit("remote", "add", "origin", "https://example.invalid/o/r.git");
    task.baseRef = "origin/preview";
    const seen = [];
    const gh = (argv) => {
      seen.push(argv.join(" "));
      if (argv[0] === "pr" && argv[1] === "list") return "[]";
      if (argv[0] === "pr" && argv[1] === "create") return "https://github.com/o/r/pull/3";
      return "{}";
    };
    const n = ensureTaskPr(task, dir, { gh, push: () => {} });
    expect(n).toBe(3);
    const create = seen.find((line) => line.startsWith("pr create"));
    expect(create).toMatch(/--base preview(\s|$)/);
    expect(create).not.toContain("origin/preview");
  });
  it("a dirty tree in review state stops as commit instead of crashing (F1)", () => {
    const { dir, task } = repository();
    task.state = "review";
    saveTask(task, dir);
    writeFileSync(path.join(dir, "stray.txt"), "dirty");
    const result = run({ next: true }, dir, {
      gh: () => "[]",
      fetchFindings: () => ({ findings: [] }),
    });
    expect(result.taskId).toBe(task.taskId);
    expect(result.needs).toBeTruthy();
    expect(loadTask(dir).state).toBe("review");
  });
  it("--review outside review state stops as usage (F8)", () => {
    const { dir, task } = repository();
    task.state = "execute";
    saveTask(task, dir);
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "review.json");
    writeFileSync(reviewFile, "{}");
    const result = run({ next: true, review: reviewFile }, dir, { push: () => {} });
    expect(result.needs).toBe("usage");
    expect(loadTask(dir).state).toBe("execute");
  });
  it("a thrown gate error returns a JSON stop, not a crash (F1)", () => {
    const { dir, task } = repository();
    task.state = "review";
    task.risk = "T3";
    task.agentAssessment.applied_tier = "T3";
    saveTask(task, dir);
    // T3 cleanは独立レビューを要求する — independent:falseの報告でclean gateが投げる。
    const report = { ...reviewFixture(task), independent: false };
    const reviewFile = path.join(mkdtempSync(path.join(tmpdir(), "next-review-")), "review.json");
    writeFileSync(reviewFile, JSON.stringify(report));
    const result = run({ next: true, review: reviewFile }, dir, {
      runVerification: () => ({ status: 0 }),
    });
    expect(result.taskId).toBe(task.taskId);
    expect(result.needs).toBeTruthy();
    expect(result.error).toBeTruthy();
    expect(loadTask(dir).state).toBe("review");
  });
  it("aftercare stops action_required when findings or threads are outstanding", () => {
    const { dir, task } = repository();
    task.state = "aftercare";
    task.review = reviewFixture(task);
    task.aftercare = { pr: 7 };
    saveTask(task, dir);
    const gh = (argv) => {
      if (argv[0] === "pr" && argv[1] === "view")
        return JSON.stringify({
          body: "PR body",
          headRefOid: task.head,
          baseRefOid: task.baseHead,
        });
      return "{}";
    };
    const result = run({ next: true }, dir, {
      gh,
      fetchPr: () => delivery(task),
      fetchFindings: () => ({ ...completeFindings, unhandledCount: 1 }),
      sleep: () => {},
      maxSeconds: 1,
    });
    expect(result.needs).toBe("action_required");
    expect(loadTask(dir).state).toBe("aftercare");
  });
  it("incident, human_gate and done stop immediately", () => {
    const { dir, task } = repository();
    for (const [state, needs] of [
      ["incident", "resolution"],
      ["human_gate", "approval"],
      ["done", null],
    ]) {
      task.state = state;
      task.review = reviewFixture(task);
      saveTask(task, dir);
      const result = run({ next: true }, dir, {});
      expect(result.needs).toBe(needs);
      expect(loadTask(dir).state).toBe(state);
    }
  });
  it("AC6: a concurrent runner's save is rejected by the lost-update guard", () => {
    // Within one process each load re-primes the snapshot, so the guard is
    // exercised at the saveTask seam every state-updating runNext step shares:
    // process A saves while the file was rewritten by another runner (B).
    const { dir, task } = repository();
    saveTask(task, dir); // A's view: snapshot=v1
    const other = JSON.parse(readFileSync(taskPath(dir), "utf8"));
    other.attempt = 99;
    writeFileSync(taskPath(dir), `${JSON.stringify(other, null, 2)}\n`); // B saves v2
    expect(() => saveTask(task, dir)).toThrow("changed by another runner");
  });
  it("parses --next and treats --review as its input, not a second action", () => {
    expect(parseArguments(["--next"]).next).toBe(true);
    expect(cliCommandName(parseArguments(["--next"]))).toBe("next");
    expect(cliCommandName(parseArguments(["--next", "--review", "r.json"]))).toBe("next");
    expect(() => run(parseArguments(["--next", "--verify-required"]), process.cwd(), {})).toThrow(
      "one task action",
    );
  });
});
