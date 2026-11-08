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

   ```bash
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

clone元の `preview` をリモートへfast-forwardで同期するだけの操作は編集に当たらない。`skills/preview-promotion` の「A. ローカル preview の同期」の条件を満たせば、preflightのPASSなしで行ってよい。

pre-commitの `--staged` checkは最後の安全網で、編集前preflightの代わりにはならない。

## 後片付け

マージ済みのworktreeは、ユーザーが削除を依頼したときだけ消す。候補を探すだけの依頼なら、一覧を返して止める。依頼が対象を名指ししていなければ（「不要なものを消して」等）、下の条件をすべて満たした候補だけを消す対象にする。

1. `git fetch origin` の後、`git worktree list --porcelain` で候補を挙げる。大きさや古さは優先度の目安で、削除してよい根拠ではない。
2. 候補ごとに次をすべて確かめる。1つでも満たさなければ、その候補は残して理由を報告する。
   - `git status --porcelain` が空
   - branchのHEADが、マージ済みPRの最終HEADと一致する（`gh pr list --head <branch> --state merged --json number,headRefOid`）
   - そのworktreeをcwdにしているprocessが無い（`lsof -a -d cwd | grep <path>`。権限等で確かめられなければ「未確認」として残す）
3. `git status --ignored --short` でignoredファイルを確かめる。`.env.local` は `pnpm run e2e:env-sync` で正本から作り直せるので退避しない。`.convex/` 等のローカルデータは、残すかどうかが依頼から読めなければユーザー判断待ちで止める。
4. `git worktree remove <path>` で消す。branchは、削除も依頼されたときだけ `git branch -d <branch>` で消す。
5. `git worktree list --porcelain` から消えたこと、clone元の `git status` が変わっていないことを確認する。
