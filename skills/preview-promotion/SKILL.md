---
name: preview-promotion
description: ローカルの preview をリモートと同期するとき、preview → main の昇格PRを作成・監視・マージするときに使う。未コミットのファイルがあるclone元での安全な同期と、昇格PRの作り方・BEHINDの扱いの正本。
license: Apache-2.0
---

# preview の同期と main への昇格

経路（task branch → `preview` → `main` → Production）は `docs/development-process.md` の「ブランチとDelivery経路」、`main` push後のリリースは `docs/production-release.md` を正本とする。PR作成後の監視・マージ判断は `skills/delivery-loop` に従う。

## A. ローカル preview の同期

`preview` をcheckoutしているworktree（clone元のこともあれば、`docs/development-process.md` の初回手順で作った `kakeibo-worktrees/preview` のこともある）は、未追跡・未コミットのファイルを持つことが多く、preflightはFAILする。fast-forwardだけの同期は編集に当たらないため、次の条件を満たせばpreflightのPASSなしで行ってよい（`skills/workspace-preflight` の「例外」）。

1. `git worktree list --porcelain` で `branch refs/heads/preview` のworktreeを特定し、そこで作業する。進行中のmerge・rebase・cherry-pickが無いことを確認する。
2. 保護する状態を記録する: `git status --porcelain --ignored` に出る未追跡・未コミット・ignoredの各pathのmodeとSHA-256（`node_modules` 等の生成物は除いてよい）。未コミットのpathは、indexの内容（`git ls-files -s -- <path>` のmodeとblob）も記録する。`HEAD` と、statusの分類（`??`・`!!` 等）は同期で変わりうるので保護対象に入れない。
3. `git fetch origin preview` の後、`git merge-base --is-ancestor preview origin/preview` で一直線に進めることを確かめる。`git diff --name-only preview origin/preview` のpathが、2で記録したpathと重なれば止める。
4. `git merge --ff-only --no-overwrite-ignore origin/preview` だけを実行する。reset・stash・削除・上書きで場所を空けない。
5. 2で記録した各pathのmodeとSHA-256、未コミットのpathのindexの内容が変わっていないこと、`HEAD` が `origin/preview` と同じSHAになったこと、`git rev-list --left-right --count preview...origin/preview` が `0 0` であることを確認する。

3〜5のどこかで条件を満たさなければ、何も変えずに止めて報告する（`AGENTS.md` の「開発ループ」の停止理由）。

## B. 昇格PR

### 作る前

- `gh pr list --base main --head preview --state open` で既存の昇格PRを探す。あれば新しく作らず、それを続ける。
- `git fetch origin preview main` の後、`git rev-list --left-right --count origin/main...origin/preview` と `git diff --stat origin/main...origin/preview` で取り込む範囲を確かめる。
- 取り込むPRの番号は `git log --first-parent origin/main..origin/preview` から拾う。

### PRの形

- base `main`、head `preview`。branchを新しく作らない。
- タイトルは `release: <取り込む変更の要約> を main に反映`。
- 本文は「概要」「変更内容」「リスク・確認事項」「検証」。概要に作成時のbase・head SHAと関連PR・Issue、リスクにschema・認可・環境設定の変更有無と未検証の項目を書く。
- baseが `preview` ではないため、更新履歴ブロック（`skills/pr-update-spec`）は書かない。原稿は取り込む元PRの本文が正本。

### 監視とマージ

- 昇格PRのE2Eは、`preview` push時に同じHEADを検証済みとしてskipされる（`docs/development-process.md` の「PR CI E2Eの差分判定」）。代わりに、`preview-deploy.yml` の同じSHAの結果を確認する。
- `main` はrequired checksに最新化を求め、未解決threadがあるとマージできない。前回の昇格のmerge commitが `preview` に無いと、PRは `BEHIND` になる。
- `BEHIND` の解消は `gh pr update-branch <番号>`（`main` を `preview` へmergeするcommitをGitHubが作る）で行う。`preview` への書き込みになるため、ユーザーの明示承認を得てから実行する。承認が無ければ承認待ちで止める。
- マージは、ユーザーが明示したときだけ行う（完了地点 `merged`）。マージ方式は直近の昇格PRと同じmerge commitにする。
- 昇格PRのマージは本番反映の承認を兼ねる。`main` へのマージで `production-release.yml` が起動し、release candidate E2Eが成功すれば承認待ちなしでProductionへ反映される（`docs/production-release.md`）。マージは本番操作として扱う。マージの依頼が本番反映に触れていなければ、本番に出ることを伝えて明示承認を得てからマージする（承認待ち）。
- マージ後は `main` の新しいSHAと、`production-release.yml` のrelease candidate E2E・Deploy Productionの結果を報告する。
