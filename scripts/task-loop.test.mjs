import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { createHash } from "node:crypto";
import {
  run,
  fingerprint,
  validateContract,
  validatePr,
  validateReview,
  validateAssessment,
  guide,
  REVIEW_REQUIREMENTS,
  reviewTierFloor,
  REVIEW_AXES,
  REVIEW_FLOOR_TRIGGERS,
  REVIEW_TIERS,
  matchesRepository,
} from "./task-loop.mjs";

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
  function assess(extra = {}) {
    const file = path.join(dir, "assessment.json");
    writeFileSync(
      file,
      JSON.stringify({
        risk_assessment: {
          blast_radius: "local",
          data_security: "none",
          reversibility: "easy",
          uncertainty: "known_pattern",
          floor_triggers: [],
        },
        tier_rationale: "fixture change is minimal",
        ...extra,
      }),
    );
    return run(["assess", "test", file], cwd);
  }
  function review(extra = {}) {
    assess();
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
    return run(["review", "test", file], cwd);
  }
  function call(...args) {
    return run([args[0], "test", ...args.slice(1)], cwd);
  }
  set();
  return { cwd, dir, contract, set, assess, review, call, git };
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
  it("requires a risk assessment and an applied tier consistent with its floor", () => {
    const f = fixture();
    f.call("check", "TC01");
    const base = {
      verdict: "pass",
      source_comparison: "c",
      diff_assessment: "d",
      verification_assessment: "v",
      manual_results: [],
      risk_assessment: {
        blast_radius: "local",
        data_security: "none",
        reversibility: "easy",
        uncertainty: "known_pattern",
        floor_triggers: [],
      },
      applied_tier: "T1",
      tier_rationale: "minimal change",
    };
    expect(validateReview(base)).toEqual([]);
    for (const missing of ["risk_assessment", "applied_tier", "tier_rationale"]) {
      const broken = { ...base };
      delete broken[missing];
      expect(validateReview(broken).length).toBeGreaterThan(0);
    }
    expect(
      validateReview({
        ...base,
        risk_assessment: { ...base.risk_assessment, blast_radius: "huge" },
      }),
    ).toContain(
      "risk_assessment.blast_radius must be one of local/several_surfaces/shared_or_system_wide",
    );
    expect(
      validateReview({
        ...base,
        risk_assessment: { ...base.risk_assessment, floor_triggers: ["invented"] },
      }),
    ).toContain("risk_assessment.floor_triggers entries must match process.yaml vocabulary");
    expect(validateReview({ ...base, applied_tier: "T9" })).toContain(
      "applied_tier must be one of T1/T2/T3",
    );
    // Middle-axis value floors at T2, extreme value or a floor trigger floors at T3.
    expect(
      validateReview({
        ...base,
        risk_assessment: { ...base.risk_assessment, uncertainty: "some_unknowns" },
        applied_tier: "T1",
      }).some((e) => e.includes("below the T2 floor")),
    ).toBe(true);
    expect(
      validateReview({
        ...base,
        risk_assessment: { ...base.risk_assessment, uncertainty: "some_unknowns" },
        applied_tier: "T2",
      }),
    ).toEqual([]);
    for (const risk of [
      { ...base.risk_assessment, blast_radius: "shared_or_system_wide" },
      { ...base.risk_assessment, data_security: "direct_boundary_change" },
      { ...base.risk_assessment, reversibility: "difficult_or_stateful" },
      { ...base.risk_assessment, uncertainty: "novel_or_impact_unclear" },
      { ...base.risk_assessment, floor_triggers: ["schema_or_migration"] },
    ]) {
      expect(reviewTierFloor(risk)).toBe("T3");
      expect(
        validateReview({ ...base, risk_assessment: risk, applied_tier: "T2" }).some((e) =>
          e.includes("below the T3 floor"),
        ),
      ).toBe(true);
    }
    expect(
      validateReview({
        ...base,
        risk_assessment: {
          ...base.risk_assessment,
          floor_triggers: ["schema_or_migration"],
        },
        applied_tier: "T3",
      }),
    ).toEqual([]);
    // CLI rejects a review that ignores the floor, then accepts the corrected record.
    const file = path.join(f.dir, "shallow.json");
    writeFileSync(
      file,
      JSON.stringify({
        ...base,
        risk_assessment: {
          ...base.risk_assessment,
          floor_triggers: ["schema_or_migration"],
        },
        applied_tier: "T1",
        tier_rationale: "claimed light review",
      }),
    );
    expect(() => run(["assess", "test", file], f.cwd)).toThrow("below the T3 floor");
  });
  it("keeps executable vocabulary and the process contract aligned", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const spec = parse(readFileSync(path.join(root, ".loop/process.yaml"), "utf8"));
    expect(spec.version).toBe(14);
    expect(spec.review_depth.axes).toEqual(REVIEW_AXES);
    expect(spec.review_depth.floor_triggers).toEqual(REVIEW_FLOOR_TRIGGERS);
    expect(Object.keys(spec.review_depth.tiers)).toEqual(REVIEW_TIERS);
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
  it("routes from initialization through checks, assessment, review and delivery without writing on status", () => {
    const f = fixture();
    const statePath = path.join(f.dir, "state.json");
    const state = JSON.parse(readFileSync(statePath));
    state.contract = null;
    writeFileSync(statePath, JSON.stringify(state));
    const before = readFileSync(statePath, "utf8");
    expect(f.call("status").next.stage).toBe("contract");
    expect(readFileSync(statePath, "utf8")).toBe(before);
    f.set();
    expect(f.call("status").next.stage).toBe("verification");
    f.contract.unresolved = ["choose behavior"];
    f.set();
    expect(f.call("status").next.stage).toBe("contract");
    f.contract.unresolved = [];
    f.set();
    f.call("check", "TC01");
    expect(f.call("status").next.stage).toBe("assessment");
    expect(f.assess().applied_tier).toBe("T1");
    const next = f.call("status").next;
    expect(next.stage).toBe("review");
    expect(next.requirements).toEqual(REVIEW_REQUIREMENTS.T1);
    f.review();
    expect(f.call("status").next.stage).toBe("delivery");
    writeFileSync(
      path.join(f.dir, "finding.json"),
      JSON.stringify({ id: "F1", description: "gap", status: "open", evidence: "observed" }),
    );
    f.call("finding", path.join(f.dir, "finding.json"));
    expect(f.call("status").next.stage).toBe("finding");
    expect(() => f.call("finish")).toThrow("open finding");
  });
  it("discloses only the requested guide without requiring git or task state", () => {
    expect(run(["guide", "assessment"], "/nonexistent")).toEqual(guide("assessment"));
    expect(guide("assessment").axes).toEqual(REVIEW_AXES);
    expect(guide("assessment").floor_triggers).toEqual(REVIEW_FLOOR_TRIGGERS);
    expect(guide("verification").axes).toBeUndefined();
    expect(guide("contract").conditional_skills).toBeDefined();
    expect(() => guide("toString")).toThrow("unknown guide topic");
  });
  it.each(REVIEW_FLOOR_TRIGGERS)(
    "forces T3 for %s and discloses cumulative obligations",
    (trigger) => {
      const f = fixture();
      const risk_assessment = {
        blast_radius: "local",
        data_security: "none",
        reversibility: "easy",
        uncertainty: "known_pattern",
        floor_triggers: [trigger],
      };
      const result = f.assess({ risk_assessment });
      expect(result.minimum_tier).toBe("T3");
      expect(result.applied_tier).toBe("T3");
      expect(result.requirements).toEqual(Object.values(REVIEW_REQUIREMENTS).flat());
      expect(() => f.assess({ risk_assessment, applied_tier: "T2" })).toThrow("below the T3 floor");
    },
  );
  it("allows deeper assessment but rejects review-time overrides and missing or stale assessments", () => {
    const f = fixture();
    const file = path.join(f.dir, "review.json");
    const review = {
      verdict: "pass",
      source_comparison: "c",
      diff_assessment: "d",
      verification_assessment: "v",
      manual_results: [],
    };
    writeFileSync(file, JSON.stringify(review));
    expect(() => f.call("review", file)).toThrow("current risk assessment");
    expect(f.assess({ applied_tier: "T3" }).applied_tier).toBe("T3");
    writeFileSync(file, "null");
    expect(() => f.call("review", file)).toThrow("invalid review: object is required");
    for (const extra of [
      { applied_tier: "T1" },
      { risk_assessment: {} },
      { tier_rationale: "override" },
    ]) {
      writeFileSync(file, JSON.stringify({ ...review, ...extra }));
      expect(() => f.call("review", file)).toThrow("must not override");
    }
    writeFileSync(file, JSON.stringify(review));
    f.call("check", "TC01");
    f.call("review", file);
    expect(f.call("finish").status).toBe("complete");
    f.assess({ applied_tier: "T3" });
    expect(() => f.call("finish")).toThrow("self-review");
    writeFileSync(path.join(f.cwd, "source.txt"), "changed");
    expect(() => f.call("review", file)).toThrow("current risk assessment");
    expect(() => f.call("finish")).toThrow("check required");
  });
  it("invalidates assessment for contract and environment changes", () => {
    const f = fixture();
    f.review();
    f.contract.environment = "test-v2";
    f.set();
    expect(() => f.call("review", path.join(f.dir, "review.json"))).toThrow(
      "current risk assessment",
    );
  });
  it("uses the shipped assessment and review templates with real manual proof", () => {
    const f = fixture();
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    f.contract.acceptance = [
      { id: "AC01", expectation: "manual behavior", manual: "inspect result" },
    ];
    f.contract.checks = [];
    f.set();
    f.call("assess", path.join(root, ".loop/templates/assessment.example.json"));
    const review = JSON.parse(readFileSync(path.join(root, ".loop/templates/review.example.json")));
    review.manual_results[0].evidence = "Observed expected fixture result";
    const file = path.join(f.dir, "review.json");
    writeFileSync(file, JSON.stringify(review));
    f.call("review", file);
    expect(f.call("finish").status).toBe("complete");
    review.manual_results = [{ target: "AC01", result: "pass", evidence: "legacy shape" }];
    writeFileSync(file, JSON.stringify(review));
    expect(() => f.call("review", file)).toThrow("manual_results require");
  });
  it("preserves v13 history but refuses its old proof and upgrades on mutation", () => {
    const f = fixture();
    f.call("check", "TC01");
    f.review();
    const file = path.join(f.dir, "state.json");
    const state = JSON.parse(readFileSync(file));
    state.version = 13;
    delete state.assessments;
    const legacyKey = createHash("sha256")
      .update(
        JSON.stringify({
          content: fingerprint(f.cwd),
          contract: f.contract,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        }),
      )
      .digest("hex");
    state.runs[0].key = legacyKey;
    state.reviews[0].key = legacyKey;
    writeFileSync(file, JSON.stringify(state));
    expect(() => f.call("finish")).toThrow("check required");
    expect(f.call("status").next.stage).toBe("verification");
    expect(JSON.parse(readFileSync(file)).version).toBe(13);
    f.call("check", "TC01");
    f.review();
    expect(f.call("finish").status).toBe("complete");
    const updated = JSON.parse(readFileSync(file));
    expect(updated.version).toBe(14);
    expect(updated.runs[0].key).toBe(legacyKey);
    expect(updated.history.length).toBeGreaterThan(state.history.length);
  });
  it("rejects malformed assessment inputs before computing depth", () => {
    for (const input of [
      null,
      {},
      { risk_assessment: {} },
      { risk_assessment: { floor_triggers: "bad" } },
    ])
      expect(validateAssessment(input).length).toBeGreaterThan(0);
  });
});
