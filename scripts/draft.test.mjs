import { afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import { run, saveTask, cliMain } from "./loop-runner.mjs";
import { taskFixture, agentAssessment } from "./loop-test-fixtures.mjs";
import {
  assessmentDraftFloors,
  buildDraft,
  issueGoalSection,
  issuePredictedRisk,
  todoPointers,
  DRAFT_TODO,
} from "./loop-draft.mjs";
import { requiredKeys, validateDocument } from "./loop-schema.mjs";
import { requireAssessmentAboveFloor, validateReview, validateSpec } from "./loop-policy.mjs";
import { validateAssessment } from "./review-depth.mjs";

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
function repository() {
  template ??= buildTemplateRepository();
  const dir = mkdtempSync(path.join(tmpdir(), "loop-draft-"));
  dirs.push(dir);
  cpSync(template, dir, { recursive: true });
  const git = gitIn(dir);
  const baseHead = git("rev-parse", "HEAD");
  const task = taskFixture(dir, { head: baseHead, baseHead, baseRef: "preview" });
  return { dir, git, task };
}
function buildTemplateRepository() {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-draft-template-"));
  cpSync(path.join(root, ".agent"), path.join(dir, ".agent"), { recursive: true });
  const git = gitIn(dir);
  mkdirSync(path.join(dir, "scripts"));
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  git("init", "-b", "preview");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("add", ".");
  git("-c", "core.hooksPath=/dev/null", "commit", "-m", "base");
  git("switch", "-c", "codex/task");
  return dir;
}
const ISSUE_BODY = `# header

## やりたいこと

draft の機械記入を入れる。\`scripts/loop-policy.mjs\` と \`docs/agent-harness.md\` を触る。

## 絶対に守りたいこと

Human Requestは改変しない。
`;
/** Replace every draft TODO with a contextually valid value for key checks. */
function fillDraft(value, key = "") {
  if (value === DRAFT_TODO) return fillValue(key);
  if (Array.isArray(value)) return value.map((item) => fillDraft(item, key));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, fillDraft(item, name)]),
    );
  return value;
}
function fillValue(key) {
  const values = {
    id: "AC1",
    result: "reproduced",
    blast_radius: "local",
    data_security: "direct_boundary_change",
    reversibility: "difficult_or_stateful",
    uncertainty: "known_pattern",
    status: "fixed",
    severity: "minor",
  };
  return values[key] ?? "filled";
}
const validSpec = {
  goal: "goal",
  humanRequest: "do the thing",
  acceptanceCriteria: [{ id: "AC1", text: "works" }],
  nonGoals: [],
  assumptions: [],
  openMaterialDecisions: [],
  verificationStrategy: ["unit"],
  predictedRisk: "T1",
};

describe("--draft", () => {
  it("AC1: fills assessment axes and applied_tier from machine triggers", () => {
    const { dir, git, task } = repository();
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src/auth.ts"), "export const guard = () => true;\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "auth");
    saveTask(task, dir);
    const result = run({ draft: "assessment" }, dir);
    const draft = JSON.parse(readFileSync(result.draft, "utf8"));
    expect(draft.risk_assessment.data_security).toBe("direct_boundary_change");
    expect(draft.risk_assessment.floor_triggers).toContain("authentication_or_authorization");
    expect(draft.applied_tier).toBe("T3");
    expect(draft.tier_rationale).toContain("authentication_or_authorization");
  });
  it("AC2: rejects an assessment below the machine-derived draft values", () => {
    const { dir, git, task } = repository();
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src/auth.ts"), "export const x = 1;\n");
    git("add", ".");
    git("-c", "core.hooksPath=/dev/null", "commit", "-m", "auth");
    saveTask(task, dir);
    const file = path.join(dir, "a.json");
    writeFileSync(
      file,
      JSON.stringify({
        risk_assessment: {
          blast_radius: "local",
          data_security: "none",
          reversibility: "easy",
          uncertainty: "known_pattern",
          floor_triggers: ["authentication_or_authorization"],
        },
        tier_rationale: "low",
        applied_tier: "T3",
      }),
    );
    expect(() => run({ assessment: file }, dir)).toThrow(
      "data_security must not be below the machine floor",
    );
    expect(() =>
      requireAssessmentAboveFloor(
        { applied_tier: "T1", risk_assessment: agentAssessment.risk_assessment },
        { floorTriggers: [], minimumTier: "T3" },
      ),
    ).toThrow("applied_tier must not be below the machine floor");
    // Raising the floor value is always allowed.
    expect(() =>
      requireAssessmentAboveFloor(
        {
          applied_tier: "T3",
          risk_assessment: {
            blast_radius: "shared_or_system_wide",
            data_security: "direct_boundary_change",
            reversibility: "difficult_or_stateful",
            uncertainty: "some_unknowns",
            floor_triggers: ["authentication_or_authorization"],
          },
        },
        { floorTriggers: ["authentication_or_authorization"], minimumTier: "T3" },
      ),
    ).not.toThrow();
  });
  it("AC3: rejects submissions that still carry TODO with JSON Pointers", () => {
    const { dir, task } = repository();
    task.state = "refine";
    saveTask(task, dir);
    const file = path.join(dir, "spec.json");
    writeFileSync(file, JSON.stringify({ ...validSpec, goal: DRAFT_TODO }));
    expect(() => run({ spec: file }, dir)).toThrow("/goal");
    writeFileSync(file, JSON.stringify({ ...validSpec, humanRequest: DRAFT_TODO }));
    expect(() => run({ spec: file }, dir)).toThrow("/humanRequest");
    writeFileSync(
      file,
      JSON.stringify({ ...validSpec, acceptanceCriteria: [{ id: "AC1", text: DRAFT_TODO }] }),
    );
    expect(() => run({ spec: file }, dir)).toThrow("/acceptanceCriteria/0/text");
  });
  it("AC4: copies the やりたいこと section verbatim into humanRequest", () => {
    const { dir } = repository();
    const gh = () => JSON.stringify({ title: "t", body: ISSUE_BODY });
    const result = run({ draft: "spec", issue: "948" }, dir, { gh });
    const draft = JSON.parse(readFileSync(result.draft, "utf8"));
    expect(draft.humanRequest).toBe(
      "draft の機械記入を入れる。`scripts/loop-policy.mjs` と `docs/agent-harness.md` を触る。",
    );
    expect(issueGoalSection(ISSUE_BODY)).toBe(draft.humanRequest);
    // Mentioned paths drive the floor prediction.
    expect(draft.predictedRisk).toBe("T3");
    expect(issuePredictedRisk("no paths here")).toBe("T1");
  });
  it("AC5: review draft AC ids equal the spec AC ids", () => {
    const { dir, task } = repository();
    task.spec.acceptanceCriteria = [
      { id: "AC1", text: "one" },
      { id: "AC9", text: "nine" },
    ];
    saveTask(task, dir);
    const result = run({ draft: "review" }, dir);
    const draft = JSON.parse(readFileSync(result.draft, "utf8"));
    expect(draft.acceptanceCriteria.map((ac) => ac.id)).toEqual(["AC1", "AC9"]);
  });
  it("AC6: writes only under the git path and changes no state or worktree", () => {
    const { dir, git, task } = repository();
    saveTask(task, dir);
    const taskFile = path.join(dir, ".git", "agent-task.json");
    const before = readFileSync(taskFile, "utf8");
    const status = git("status", "--porcelain");
    const result = run({ draft: "assessment" }, dir);
    expect(readFileSync(taskFile, "utf8")).toBe(before);
    expect(git("status", "--porcelain")).toBe(status);
    expect(result.draft.startsWith(path.join(dir, ".git", "agent-drafts"))).toBe(true);
  });
  it("AC8: assessment drafts never carry verification_load", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const result = run({ draft: "assessment" }, dir);
    expect(readFileSync(result.draft, "utf8")).not.toContain("verification_load");
  });
  it("requires an initialized task for non-spec kinds and --event for exit", () => {
    const { dir } = repository();
    expect(() => run({ draft: "assessment" }, dir)).toThrow("--draft assessment requires");
    expect(() => run({ draft: "exit" }, dir)).toThrow("--draft exit requires --event");
    const { dir: dir2, task } = repository();
    saveTask(task, dir2);
    expect(() => run({ draft: "exit" }, dir2)).toThrow("--draft exit requires --event");
    expect(() => run({ draft: "wat" }, dir2)).toThrow("spec|assessment|review|exit");
  });
});

describe("AC7: filled drafts satisfy key-level validation for every kind/event", () => {
  it("spec draft keys validate", () => {
    const draft = buildDraft({ kind: "spec", issueBody: ISSUE_BODY, root });
    expect(() => validateSpec(fillDraft(draft), root)).not.toThrow();
    // Without --issue the humanRequest is a TODO the agent must fill.
    const bare = buildDraft({ kind: "spec", root });
    expect(todoPointers(bare)).toContain("/humanRequest");
  });
  it("assessment draft keys validate and satisfy the floor", () => {
    const machine = {
      floorTriggers: ["authentication_or_authorization"],
      minimumTier: "T3",
    };
    const draft = buildDraft({ kind: "assessment", machine, root });
    const filled = fillDraft(draft);
    expect(validateAssessment(filled)).toEqual([]);
    expect(() => requireAssessmentAboveFloor(filled, machine)).not.toThrow();
    for (const key of requiredKeys("assessment", {}, root)) expect(draft).toHaveProperty(key);
  });
  it("review draft keys validate", () => {
    const { dir, task } = repository();
    saveTask(task, dir);
    const draft = buildDraft({
      kind: "review",
      task,
      head: task.head,
      baseHead: task.baseHead,
      root,
    });
    const filled = fillDraft(draft);
    filled.reviewer = "reviewer-1";
    expect(() => validateReview(task, filled)).not.toThrow();
    for (const key of requiredKeys("review", {}, root)) expect(draft).toHaveProperty(key);
  });
  const events = Object.entries(
    YAML.parse(readFileSync(path.join(root, ".agent/process.yaml"), "utf8")).states,
  ).flatMap(([state, config]) => Object.keys(config.on ?? {}).map((event) => ({ state, event })));
  it.each(events)("exit draft for $state/$event validates", ({ state, event }) => {
    const task = { state, counters: { review: 0, ci: 0, sameFailure: 0 } };
    const limits = YAML.parse(readFileSync(path.join(root, ".agent/process.yaml"), "utf8")).limits;
    const draft = buildDraft({ kind: "exit", task, event, limits, root });
    for (const key of requiredKeys("exit", { event, state, counters: task.counters, limits }, root))
      expect(draft).toHaveProperty(key);
    const filled = fillDraft(draft);
    expect(() => validateDocument("exit", filled, root)).not.toThrow();
  });
});

describe("draft helpers", () => {
  it("todoPointers reports RFC 6901 pointers only for TODO values", () => {
    expect(
      todoPointers({ a: DRAFT_TODO, b: [{ c: DRAFT_TODO }], d: "ok", e: [DRAFT_TODO] }),
    ).toEqual(["/a", "/b/0/c", "/e/0"]);
    expect(todoPointers({ a: "done" })).toEqual([]);
  });
  it("assessmentDraftFloors maps only the documented trigger sets", () => {
    expect(assessmentDraftFloors([])).toEqual({ data_security: null, reversibility: null });
    expect(assessmentDraftFloors(["authentication_or_authorization"])).toEqual({
      data_security: "direct_boundary_change",
      reversibility: null,
    });
    expect(assessmentDraftFloors(["external_service_write_or_webhook"])).toEqual({
      data_security: null,
      reversibility: "difficult_or_stateful",
    });
    expect(assessmentDraftFloors(["data_deletion_or_retention"])).toEqual({
      data_security: "direct_boundary_change",
      reversibility: "difficult_or_stateful",
    });
    expect(assessmentDraftFloors(["schema_or_migration"])).toEqual({
      data_security: "direct_boundary_change",
      reversibility: "difficult_or_stateful",
    });
  });
  it("issueGoalSection returns null without the section", () => {
    expect(issueGoalSection("## other\ncontent")).toBeNull();
  });
  it("cli exposes --draft and writes the draft file", () => {
    const { dir } = repository();
    const output = [];
    const code = cliMain(["--draft", "spec"], { root: dir, log: (line) => output.push(line) });
    expect(code).toBe(0);
    const result = JSON.parse(output.join(""));
    expect(result.kind).toBe("spec");
    expect(existsSync(result.draft)).toBe(true);
  });
});
