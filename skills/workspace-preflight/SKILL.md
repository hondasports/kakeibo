---
name: workspace-preflight
description: 編集前のpreflight（scripts/check-task-worktree.mjs）がFAILしたとき、task worktreeを作るとき、マージ済みのworktreeを片付けるときに使う。PASS条件・FAIL時の対処・例外・worktreeの置き場所と削除条件の正本。
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

1. 最新の `origin/preview` からtask branchとworktreeを作る（branch prefixはruntime固有の約束で固定しない）。置き場所は `docs/development-process.md` の「Worktree」の配置（`../kakeibo-worktrees/<name>`）にする。`/private/tmp` 等の一時領域に作らない。OSの掃除で消えると未pushのcommitやignoredファイルを失い、`git worktree list` に壊れた登録（prunable）が残るため。

   相対pathはclone元（`git worktree list` の先頭）のrootを基準にする。別のtask worktreeから実行すると `kakeibo-worktrees/kakeibo-worktrees/<name>` のように意図しない場所に作られる。

   ```bash
   cd "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
   git fetch origin preview
   git worktree add ../kakeibo-worktrees/<name> -b <task-branch> origin/preview
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

`preview` をcheckoutしているworktreeをリモートへfast-forwardで同期するだけの操作は編集に当たらない。`skills/preview-promotion` の「A. ローカル preview の同期」の条件を満たせば、preflightのPASSなしで行ってよい。

pre-commitの `--staged` checkは最後の安全網で、編集前preflightの代わりにはならない。

## 後片付け

マージ済みworktreeの削除候補の判定条件と削除手順は [references/cleanup.md](references/cleanup.md) が正本。ユーザーが削除候補の調査・片付け・削除を依頼したときだけ読む。
