import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { run, fingerprint, validateContract, validatePr, matchesRepository } from "./task-loop.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), "task-loop-"));
  roots.push(cwd);
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  git("init", "-b", "codex/test");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  mkdirSync(path.join(cwd, "scripts"));
  // Test fixture substitutes only the separately tested worktree preflight.
  writeFileSync(path.join(cwd, "scripts/check-task-worktree.mjs"), "process.exit(0);");
  writeFileSync(path.join(cwd, ".gitignore"), ".loop/state/\n");
  writeFileSync(path.join(cwd, "source.txt"), "original");
  git("add", ".");
  git("commit", "-m", "initial");
  run(["init", "test"], cwd);
  const dir = path.join(cwd, ".loop/state/test");
  const contract = {
    goal: "observable behavior",
    source: "test request",
    environment: "test-v1",
    delivery_target: "local_verified",
    in_scope: ["test"],
    out_of_scope: [],
    unresolved: [],
    acceptance: [{ id: "AC01", expectation: "check passes", checks: ["TC01"] }],
    preserve: [],
    controls: [],
    checks: [
      {
        id: "TC01",
        purpose: "execute real process",
        argv: [process.execPath, "-e", "process.exit(0)"],
        timeout_ms: 5000,
      },
    ],
  };
  function set(c = contract, reason = "test revision") {
    const file = path.join(dir, "contract.json");
    writeFileSync(file, JSON.stringify(c));
    run(["contract", "test", file, reason], cwd);
  }
  function review(extra = {}) {
    const file = path.join(dir, "review.json");
    writeFileSync(
      file,
      JSON.stringify({
        verdict: "pass",
        source_comparison: "Compared original request",
        diff_assessment: "AC01 covers diff",
        verification_assessment: "Executed relevant check",
        manual_results: [],
        ...extra,
      }),
    );
    run(["review", "test", file], cwd);
  }
  function call(...args) {
    return run([args[0], "test", ...args.slice(1)], cwd);
  }
  set();
  return { cwd, dir, contract, set, review, call, git };
}
describe("task loop execution boundaries", () => {
  it("accepts manual-only requirements without checks but still requires their evidence", () => {
    const f = fixture();
    f.contract.acceptance = [
      { id: "AC01", expectation: "manual behavior", manual: "inspect result" },
    ];
    f.contract.preserve = [
      { id: "IV01", expectation: "preserved behavior", manual: "inspect old path" },
    ];
    f.contract.controls = [{ id: "CTRL01", expectation: "boundary", manual: "inspect boundary" }];
    f.contract.checks = [];
    f.set();
    f.review();
    expect(() => f.call("finish")).toThrow("manual proof required");
    f.review({
      manual_results: ["AC01", "IV01", "CTRL01"].map((id) => ({
        id,
        status: "pass",
        evidence: "observed expected result",
      })),
    });
    expect(f.call("finish").status).toBe("complete");
  });
  it.each([null, "TC01", {}, 42])(
    "rejects a non-array checks field even with manual evidence: %j",
    (checks) => {
      const f = fixture();
      f.contract.acceptance = [
        { id: "AC01", expectation: "manual behavior", manual: "inspect", checks },
      ];
      expect(validateContract(f.contract)).toContain("requirement checks must be an array");
    },
  );
  it("does not accept omitted checks without a manual method or unknown check IDs", () => {
    const f = fixture();
    f.contract.acceptance = [{ id: "AC01", expectation: "behavior" }];
    expect(validateContract(f.contract)).toContain(
      "requirement needs checks or an explicit manual verification method",
    );
    f.contract.acceptance[0].checks = ["missing"];
    f.contract.acceptance[0].manual = "inspect";
    expect(validateContract(f.contract)).toContain("unknown verification check");
  });
  it("rejects force-staged task state before accepting evidence or completion", () => {
    const f = fixture();
    f.call("check", "TC01");
    f.review();
    f.git("add", "-f", ".loop/state/test/state.json");
    expect(() => f.call("status")).toThrow("ignored and untracked");
    expect(() => f.call("finish")).toThrow("ignored and untracked");
  });
  it("matches canonical repository identity without accepting neighboring names or hosts", () => {
    expect(matchesRepository("https://github.com/NewOwner/Repo/pull/1", "newowner/repo")).toBe(
      true,
    );
    expect(matchesRepository("https://github.com/Other/Repo/pull/1", "newowner/repo")).toBe(false);
    expect(
      matchesRepository("https://github.com/NewOwner/Repo-extra/pull/1", "newowner/repo"),
    ).toBe(false);
    expect(matchesRepository("https://example.com/NewOwner/Repo/pull/1", "newowner/repo")).toBe(
      false,
    );
    expect(matchesRepository("https://github.com/NewOwner/Repo/pull/1", undefined)).toBe(false);
  });
  it("distinguishes publish-only from merge-ready and rejects stale PR identity", () => {
    const identity = { head: "abc", branch: "codex/test", base: "preview", target: "merge_ready" };
    const pr = {
      state: "OPEN",
      headRefOid: "abc",
      headRefName: "codex/test",
      baseRefName: "preview",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "",
      statusCheckRollup: [],
    };
    expect(() => validatePr(pr, identity)).not.toThrow();
    for (const change of [{ headRefOid: "old" }, { baseRefName: "main" }, { state: "CLOSED" }])
      expect(() => validatePr({ ...pr, ...change }, { ...identity, target: "pr_created" })).toThrow(
        "identity",
      );
    for (const change of [
      { isDraft: true },
      { mergeable: "UNKNOWN" },
      { reviewDecision: "REVIEW_REQUIRED" },
      { mergeStateStatus: "BLOCKED" },
    ])
      expect(() => validatePr({ ...pr, ...change }, identity)).toThrow("merge-ready");
    const pending = {
      ...pr,
      statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null }],
    };
    expect(() => validatePr(pending, identity)).toThrow("checks");
    expect(() => validatePr(pending, { ...identity, target: "pr_created" })).not.toThrow();
    expect(() =>
      validatePr(
        { ...pr, statusCheckRollup: [{ __typename: "StatusContext", state: "FAILURE" }] },
        identity,
      ),
    ).toThrow("checks");
  });
  it("cannot finish without actual check and current review, then records completion", () => {
    const f = fixture();
    expect(() => f.call("finish")).toThrow("check required");
    f.call("check", "TC01");
    expect(() => f.call("finish")).toThrow("self-review");
    f.review();
    expect(f.call("finish").status).toBe("complete");
  });
  it("invalidates evidence for uncommitted and untracked edits and deletion", () => {
    const f = fixture();
    f.call("check", "TC01");
    f.review();
    const old = fingerprint(f.cwd);
    writeFileSync(path.join(f.cwd, "source.txt"), "changed");
    expect(fingerprint(f.cwd)).not.toBe(old);
    expect(() => f.call("finish")).toThrow("check required");
    const modified = fingerprint(f.cwd);
    writeFileSync(path.join(f.cwd, "new.txt"), "untracked");
    expect(fingerprint(f.cwd)).not.toBe(modified);
    const added = fingerprint(f.cwd);
    rmSync(path.join(f.cwd, "source.txt"));
    expect(fingerprint(f.cwd)).not.toBe(added);
  });
  it("does not invalidate for ignored state/log writes or a same-content commit", () => {
    const f = fixture();
    f.call("check", "TC01");
    f.review();
    const key = fingerprint(f.cwd);
    writeFileSync(path.join(f.dir, "extra.log"), "output");
    f.git("commit", "--allow-empty", "-m", "same content");
    expect(fingerprint(f.cwd)).toBe(key);
    expect(f.call("finish").status).toBe("complete");
  });
  it("records nonzero exit and refuses completion", () => {
    const f = fixture();
    f.contract.checks[0].argv = [process.execPath, "-e", "process.exit(7)"];
    f.set();
    expect(() => f.call("check", "TC01")).toThrow("check failed");
    const state = JSON.parse(readFileSync(path.join(f.dir, "state.json")));
    expect(state.runs.at(-1).exit_code).toBe(7);
    f.review();
    expect(() => f.call("finish")).toThrow("check required");
  });
  it("fails timeout and source changes during a successful command", () => {
    const f = fixture();
    f.contract.checks[0].argv = [process.execPath, "-e", "setTimeout(()=>{},5000)"];
    f.contract.checks[0].timeout_ms = 30;
    f.set();
    expect(() => f.call("check", "TC01")).toThrow("check failed");
    f.contract.checks[0].timeout_ms = 5000;
    f.contract.checks[0].argv = [
      process.execPath,
      "-e",
      "require('fs').writeFileSync('source.txt','mutated')",
    ];
    f.set();
    expect(() => f.call("check", "TC01")).toThrow("content changed");
  });
  it("invalidates on contract/environment revision and blocks unresolved requirements", () => {
    const f = fixture();
    f.call("check", "TC01");
    f.review();
    f.contract.environment = "test-v2";
    f.set();
    expect(() => f.call("finish")).toThrow("check required");
    f.contract.unresolved = ["choose behavior"];
    f.set();
    expect(() => f.call("check", "TC01")).toThrow("material questions");
  });
  it("requires manual evidence and resolves findings by stable ID with history", () => {
    const f = fixture();
    f.contract.controls = [
      { id: "CTRL01", expectation: "manual boundary", checks: [], manual: "inspect boundary" },
    ];
    f.set();
    f.call("check", "TC01");
    f.review();
    expect(() => f.call("finish")).toThrow("manual proof");
    f.review({
      manual_results: [
        { id: "CTRL01", status: "pass", evidence: "inspected boundary at source.txt" },
      ],
    });
    const file = path.join(f.dir, "finding.json");
    const finding = { id: "F1", description: "gap", status: "open", evidence: "inspection" };
    writeFileSync(file, JSON.stringify(finding));
    f.call("finding", file);
    expect(() => f.call("finish")).toThrow("open finding");
    writeFileSync(
      file,
      JSON.stringify({ ...finding, status: "resolved", evidence: "verified fix" }),
    );
    f.call("finding", file);
    expect(f.call("finish").status).toBe("complete");
    const state = JSON.parse(readFileSync(path.join(f.dir, "state.json")));
    expect(state.findings).toHaveLength(1);
    expect(state.history.find((x) => x.previous?.id === "F1").previous.status).toBe("open");
  });
  it("rejects invalid IDs, branch mismatch, and repeat initialization", () => {
    const f = fixture();
    expect(() => run(["status", "../escape"], f.cwd)).toThrow("usage");
    expect(() => f.call("init")).toThrow("already exists");
    f.git("checkout", "-b", "codex/another");
    expect(() => f.call("status")).toThrow("identity mismatch");
  });
  it("rejects empty acceptance, unknown checks and invalid command input", () => {
    const f = fixture();
    expect(validateContract({ ...f.contract, acceptance: [] })).toContain(
      "acceptance cannot be empty",
    );
    expect(
      validateContract({
        ...f.contract,
        acceptance: [{ id: "AC", expectation: "x", checks: ["missing"] }],
      }),
    ).toContain("unknown verification check");
    f.contract.checks[0].argv = [];
    expect(validateContract(f.contract)).toContain("check argv must be non-empty strings");
  });
});
