import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PRE_EDIT = path.join(root, "scripts", "agent-hooks", "claude-pre-edit.mjs");
const STOP = path.join(root, "scripts", "agent-hooks", "claude-stop.mjs");
const LOOP_RUNNER = path.join(root, "scripts", "loop-runner.mjs");

const dirs = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repoWithTask({ state = "execute", harness = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-hooks-"));
  dirs.push(dir);
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-b", "main"]);
  // The hook invokes <toplevel>/scripts/loop-runner.mjs — copy the real one
  // (a symlink breaks the script's argv[1] === import.meta.url self-check),
  // and link node_modules for its bare imports (yaml).
  cpSync(path.join(root, "scripts"), path.join(dir, "scripts"), { recursive: true });
  symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "dir");
  mkdirSync(path.join(dir, ".agent"), { recursive: true });
  writeFileSync(path.join(dir, ".agent", "process.yaml"), "states: {}\n");
  if (!harness) rmSync(path.join(dir, ".agent", "process.yaml"));
  if (state !== null)
    writeFileSync(
      path.join(dir, ".git", "agent-task.json"),
      `${JSON.stringify({ taskId: "t", state })}\n`,
    );
  return { dir, inside: path.join(dir, "src", "a.ts"), outside: path.join(dir, "..", "x.ts") };
}

function runHook(script, cwd, input) {
  const start = performance.now();
  const result = spawnSync("node", [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 15000,
  });
  return { ...result, status: result.status, elapsedMs: performance.now() - start };
}

const editInput = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });

describe("loop-runner --hook-state", () => {
  it("reports the task state and next actions without mutating", () => {
    const { dir } = repoWithTask({ state: "execute" });
    const before = execFileSync("cat", [".git/agent-task.json"], {
      cwd: dir,
      encoding: "utf8",
    });
    const out = JSON.parse(
      execFileSync("node", [LOOP_RUNNER, "--hook-state"], { cwd: dir, encoding: "utf8" }),
    );
    expect(out.state).toBe("execute");
    expect(Array.isArray(out.next)).toBe(true);
    expect(execFileSync("cat", [".git/agent-task.json"], { cwd: dir, encoding: "utf8" })).toBe(
      before,
    );
  });

  it("reports state:null when the task is uninitialized", () => {
    const { dir } = repoWithTask({ state: null });
    const out = JSON.parse(
      execFileSync("node", [LOOP_RUNNER, "--hook-state"], { cwd: dir, encoding: "utf8" }),
    );
    expect(out).toEqual({ state: null, next: [] });
  });
});

describe("claude-pre-edit", () => {
  it("AC1: denies a worktree edit when the task is uninitialized", () => {
    const { dir, inside } = repoWithTask({ state: null });
    const result = runHook(PRE_EDIT, dir, editInput(inside));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--init");
  });

  it("AC1: always allows edits outside the worktree", () => {
    const { dir, outside } = repoWithTask({ state: "refine" });
    expect(runHook(PRE_EDIT, dir, editInput(outside)).status).toBe(0);
    expect(runHook(PRE_EDIT, dir, editInput("/tmp/scratch.md")).status).toBe(0);
  });

  it("AC2: denies during refine and allows during execute", () => {
    const refine = repoWithTask({ state: "refine" });
    const denied = runHook(PRE_EDIT, refine.dir, editInput(refine.inside));
    expect(denied.status).toBe(2);
    expect(denied.stderr).toContain("state=refine");

    const execute = repoWithTask({ state: "execute" });
    expect(runHook(PRE_EDIT, execute.dir, editInput(execute.inside)).status).toBe(0);
  });

  it("allows worktree edits during incident (切り分け用の一時変更)", () => {
    const { dir, inside } = repoWithTask({ state: "incident" });
    expect(runHook(PRE_EDIT, dir, editInput(inside)).status).toBe(0);
  });

  it("reads tool_input.notebook_path for NotebookEdit", () => {
    const { dir, inside } = repoWithTask({ state: "refine" });
    const result = runHook(PRE_EDIT, dir, {
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: inside },
    });
    expect(result.status).toBe(2);
  });

  it("AC5: completes well under the hook budget", () => {
    const { dir, inside } = repoWithTask({ state: "execute" });
    expect(runHook(PRE_EDIT, dir, editInput(inside)).elapsedMs).toBeLessThan(2000);
  });

  it("AC6: always allows outside this harness (no .agent/process.yaml)", () => {
    const { dir, inside } = repoWithTask({ state: "refine", harness: false });
    expect(runHook(PRE_EDIT, dir, editInput(inside)).status).toBe(0);
  });
});

describe("claude-stop", () => {
  it("AC3: stop_hook_active always allows (single bounce)", () => {
    const { dir } = repoWithTask({ state: "execute" });
    expect(runHook(STOP, dir, { stop_hook_active: true }).status).toBe(0);
  });

  it("AC4: allows stopping in human_gate and done", () => {
    const gate = repoWithTask({ state: "human_gate" });
    expect(runHook(STOP, gate.dir, {}).status).toBe(0);
    const done = repoWithTask({ state: "done" });
    expect(runHook(STOP, done.dir, {}).status).toBe(0);
  });

  it("bounces a stop while the task is in flight, with state and next on stderr", () => {
    const { dir } = repoWithTask({ state: "execute" });
    const result = runHook(STOP, dir, {});
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("State=execute");
    expect(result.stderr).toContain("next=");
  });

  it("allows stopping when there is no task state", () => {
    const { dir } = repoWithTask({ state: null });
    expect(runHook(STOP, dir, {}).status).toBe(0);
  });

  it("AC6: allows stopping outside this harness", () => {
    const { dir } = repoWithTask({ state: "execute", harness: false });
    expect(runHook(STOP, dir, {}).status).toBe(0);
  });
});
