---
name: workspace-preflight
description: repository変更の最初の編集前に使うcheap deterministic control。task worktree、非protected branch、clean baselineを強制する。
license: Apache-2.0
---

# Workspace Preflight

## 適用

repository fileを変更するtaskでは最初の編集前に実行する。

編集前に実行するdeterministic control。

## 実行

task worktree rootで:

```bash
node scripts/check-task-worktree.mjs --require-clean
```

このscriptが機械的に証明するPASS条件:

- exit code 0
- `WORKSPACE_PREFLIGHT status: PASS`
- `main` / `preview` ではないtask branch
- canonical worktreeとは別の登録済みworktree
- clean baseline

`task identity == branch` や「差分が他task由来ではない」ことは、このscript単体では判定しない。これらは要求工程でのタスクとブランチの紐付け確認、および引き渡し時の差分範囲の整合確認で扱い、scriptのPASS証跡として水増ししない。

preflight後、差分候補が見える段階で `node scripts/suggest-skills.mjs` を実行し、条件スキルの読み漏れを機械的に確認する。

## FAIL

FAILしたまま編集しない。

- canonical worktree
- `main` / `preview`
- detached HEAD
- unregistered worktree
- pre-existing uncommitted diff

必要なら:

```bash
git worktree add <task-path> -b codex/<task-name> preview
```

既存差分を勝手にreset/stash/deleteしない。

## 例外

`docs/`、`README.md`、`CHANGELOG.md`だけのpure docsは理由を記録して省略可。

次はpure docs扱いしない。

- `AGENTS.md`
- `skills/`
- `scripts/`
- config
- app code

pre-commitの`--staged` checkは最後の安全網であり、編集前preflightの代替ではない。
