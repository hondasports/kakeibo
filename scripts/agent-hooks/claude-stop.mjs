#!/usr/bin/env node
// Claude Code Stop hook (Issue #945): when the task is still in flight and
// next actions remain, bounce the stop once so the run continues. Never loops:
// stop_hook_active=true means this hook already fired once — always allow then.
//
// Input: hook JSON on stdin (stop_hook_active).
// Output contract: exit 0 = allow stop; exit 2 = block stop, stderr is fed
// back to the model.
//
// Always allows: stop_hook_active, repos without .agent/process.yaml, missing
// task state, and the states where stopping is legitimate (human_gate, done).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const allow = () => process.exit(0);
const bounce = (line) => {
  process.stderr.write(`${line}\n`);
  process.exit(2);
};

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}
if (input.stop_hook_active === true) allow();

let toplevel;
try {
  toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
} catch {
  allow();
}
if (!existsSync(path.join(toplevel, ".agent", "process.yaml"))) allow();

let hookState = null;
try {
  const out = execFileSync(
    "node",
    [path.join(toplevel, "scripts", "loop-runner.mjs"), "--hook-state"],
    { cwd: toplevel, encoding: "utf8", timeout: 15000 },
  );
  hookState = JSON.parse(out);
} catch {
  allow(); // Cannot read the task state — do not trap the session.
}
if (!hookState?.state) allow();
if (hookState.state === "human_gate" || hookState.state === "done") allow();
bounce(
  `現在のState=${hookState.state}、next=${(hookState.next ?? []).join(" ; ")}。続行するか、ユーザー判断が必要なら --event decision_required を記録すること`,
);
