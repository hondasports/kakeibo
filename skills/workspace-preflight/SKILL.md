---
name: workspace-preflight
description: 編集前のpreflight（scripts/check-task-worktree.mjs）がFAILしたとき、またはtask worktreeを作るときに使う。PASS条件・FAIL時の対処・pure docsの例外の正本。
license: Apache-2.0
---

# Workspace Preflight

実行するコマンドは `AGENTS.md` のCore contractにある。このファイルは判定の意味と、FAILしたときの対処を持つ。

## PASS条件

`node scripts/check-task-worktree.mjs --require-clean` をtask worktree rootで実行し、次を満たす。

- exit code 0 と `WORKSPACE_PREFLIGHT status: PASS`
- `main` / `preview` ではなく、detached HEADでもないtask branch
- canonical worktreeとは別の、Gitに登録済みのworktree
- clean baseline

scriptは「task identity == branch」や「差分が他task由来ではない」ことを判定しない。task↔branchの紐付けと差分範囲はIssue・PR本文で確認し、scriptのPASS証跡として水増ししない。

## FAILしたとき

FAILしたまま編集しない。既存差分をreset / stash / deleteして場所を空けず、別worktreeへ分離する。

1. 最新の `origin/preview` からtask branchとworktreeを作る（branch prefixはruntime固有の約束で固定しない）。

   ```bash
   git fetch origin preview
   git worktree add <task-path> -b <task-branch> origin/preview
   ```

2. `docs/development-process.md` の「Worktree作成時セットアップ」（依存・hook・`.env.local`・indexion digest）を実行する。`.husky/_` が無いとhookが動かないままcommit・pushが通る。
3. preflightを再実行してPASSを確認してから編集する。

## 例外

`docs/`・`README.md` だけのpure docsは、理由を記録すれば省略できる。次はpure docs扱いしない。

- `AGENTS.md`
- `skills/`
- `scripts/`
- `.github/`
- 設定ファイル
- アプリコード

pre-commitの `--staged` checkは最後の安全網で、編集前preflightの代わりにはならない。
