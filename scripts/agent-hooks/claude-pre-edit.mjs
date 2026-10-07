#!/usr/bin/env node
// Claude Code PreToolUse hook (Issue #945): mechanically enforce
// "編集はEXECUTE状態でのみ" for files inside the task worktree.
//
// Input: hook JSON on stdin (tool_name, tool_input.file_path | tool_input.notebook_path).
// Output contract: exit 0 = allow; exit 2 = deny, stderr is fed back to the model.
//
// Allows: paths outside the worktree (/tmp scratch, other checkouts), repos
// without .agent/process.yaml, state=incident (切り分け用の一時変更), and any
// read/non-edit tool (matcher limits this hook to edit tools anyway).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const allow = () => process.exit(0);
const deny = (line) => {
  process.stderr.write(`${line}\n`);
  process.exit(2);
};

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (typeof filePath !== "string" || filePath.length === 0) allow();

let toplevel;
try {
  toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
} catch {
  allow(); // Not a git repository.
}
if (!existsSync(path.join(toplevel, ".agent", "process.yaml"))) allow();

const resolved = path.resolve(filePath);
if (resolved !== toplevel && !resolved.startsWith(`${toplevel}${path.sep}`)) allow();

let hookState = null;
try {
  const out = execFileSync(
    "node",
    [path.join(toplevel, "scripts", "loop-runner.mjs"), "--hook-state"],
    { cwd: toplevel, encoding: "utf8", timeout: 15000 },
  );
  hookState = JSON.parse(out);
} catch {
  deny("Agent harnessの状態を読み取れません。loop-runnerを先に確認してください");
}
if (!hookState?.state)
  deny("Agent taskが未開始です。先に loop-runner.mjs --init で初期化してください");
if (hookState.state !== "execute" && hookState.state !== "incident")
  deny(
    `state=${hookState.state} のためworktree内の編集を拒否しました。next=${(hookState.next ?? []).join(" ; ")}`,
  );
allow();
