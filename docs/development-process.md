# 開発プロセス

このドキュメントは Suzumemo（kakeibo）の**日常開発・PR・リリース運用の入口**を定義する。

Agent Loopの詳細をここへ二重定義しない。この文書は非normativeな運用説明で、内容が衝突した場合は次を正本とする。

- Agent実行契約: `AGENTS.md`
- Loop実行条件: `.loop/process.yaml`
- Task contract example: `.loop/templates/contract.example.json`
- Current task instance / Finding Ledger: `.loop/state/<task-id>/state.json`（worktree-local・ignored）
- 各工程の手順: `skills/*/SKILL.md`
- 技術設計: `docs/technical-design.md`
- 認証: `docs/auth-guard.md`
- UI/UX: `docs/ui-ux-design.md`
- QA: `docs/qa-checklist.md`
- 環境変数: `docs/environment-variables.md`
- Convex編集前: `convex/_generated/ai/guidelines.md`

この文書の目的は、上記正本を毎回再説明せず、**branch / worktree / environment / PR / CI / release の運用境界だけを短く共有すること**である。

---

## 1. ブランチとDelivery経路

基本経路:

```text
task branch
  ↓ PR
preview
  ↓ PREVIEW確認
main
  ↓ release candidate / approval
Production
```

- `main` は保護対象のリリース候補ブランチ。
- 日常開発の統合先は `preview`。
- task branch は最新の `preview` から作る。
- `main` / `preview` を直接編集・直接pushしない。
- 同一taskの修正は同じbranch / PRへ積む。
- 1 taskにつきDelivery PRは原則1つ。

通常のAgent Delivery baseは `preview`、targetは `merge_ready`。

`PR created` はcheckpointであり完了ではない。ユーザーが明示的に「PR作成まで」と指定しない限り、latest PR contentのCI・review・conflict・mergeabilityを確認する。

Task stateはCLI initで初期化する。現在値をtracked templateへ記入しない。公開前にCLI statusとstaged diffを確認する。

---

## 2. Worktree

コード、設定、migration、Agent process等のrepository changeは、task専用worktreeで行う。

推奨配置:

```text
<parent>/
  kakeibo/                    # clone元
  kakeibo-worktrees/
    preview/                  # preview用 / .env.local正本
    <task-branch>/            # task用
```

初回:

```bash
git fetch origin preview
git worktree add ../kakeibo-worktrees/preview preview
```

task worktree:

```bash
git worktree add ../kakeibo-worktrees/<branch-name> -b <branch-name> origin/preview
```

既存の他task差分をreset / stash / deleteして作業場所を空けない。別worktreeへ分離する。

### Workspace Preflight

repository fileを変更するtaskは、**最初の編集前**にtask worktree rootで実行する。

```bash
node scripts/check-task-worktree.mjs --require-clean
```

PASS条件:

- exit code `0`
- `WORKSPACE_PREFLIGHT status: PASS`
- `main` / `preview`ではない
- detached HEADではない
- Gitに登録済みtask worktree
- clean baseline
- 他task差分なし

FAILしたまま編集しない。

`docs/`、`README.md`、`CHANGELOG.md`だけのpure docsは理由を記録して例外にできる。ただし次はpure docs扱いしない。

- `AGENTS.md`
- `.loop/`
- `skills/`
- `scripts/`
- `.github/`
- 設定ファイル
- アプリコード

pre-commitの `check-task-worktree.mjs --staged` は最後の安全網であり、編集前preflightの代替ではない。

---

## 3. `.env.local` とローカル環境

`preview` worktreeの `.env.local` をローカルE2E用の正本とする。

初回bootstrap時、preview側に無ければclone元の `.env.local` からコピーできる。どちらにも無い場合は環境を復旧するまで進めない。

```bash
if [ ! -f ../kakeibo-worktrees/preview/.env.local ]; then
  if [ ! -f .env.local ]; then
    echo ".env.local がありません。ローカル開発環境を復旧してください。" >&2
    exit 1
  fi
  cp .env.local ../kakeibo-worktrees/preview/.env.local
fi
```

task worktree作成後は、同期コマンドのcopy-only modeで正本をコピーする。

```bash
pnpm run e2e:env-sync -- --copy-only
```

`--copy-only` は `.env.local` のコピーだけを行い、コピー元がcloud devを向いていてもConvex deploymentの環境変数を書き換えない。手動コピーよりこちらを既定とする。

秘密値はchat、Issue、PR、log、commitへ出さない。

環境変数の個別用途・CI Secretの対応は `docs/environment-variables.md` を正本とする。

---

## 4. Issue運用

次は原則Issueを作成する。

- 機能追加
- バグ修正
- 設計 / architecture変更
- Convex schema / index / auth / migration
- 認可・group/data boundary
- billing / payment
- ユーザー影響・データ影響が不明な変更

次はIssue任意。

- typo
- pure docs
- behavior-preserving small refactor
- runtime behaviorを変えない小さなdependency/config整理

Issueには最低限:

- 目的
- 背景 / 問題
- 期待する結果
- 完了条件

Issue / PRのタイトル・本文・コメントは原則日本語。コード、コマンド、固有名詞、log等は原文可。

### Issueは判断履歴であって実行ログではない

Agent taskで残す価値があるもの:

- PREPAREで確定したGoal / scope / Acceptance Criteria
- materialなSpec reconciliation / Human Gate
- 重要な設計判断と見送った案
- 実装中にmaterially変わった判断
- blocking finding / follow-up
- Delivery / Aftercareの最終結果

残さなくてよいもの:

- Agentごとの逐次作業ログ
- 全Gateの開始/終了コメント
- reviewer quorumのための記録
- 一時コマンド一覧
- `implementation-plan.md`、`delivery-notes.md`等の一時ファイル

`docs/superpowers/` に一時設計書・実装計画を増やさない。

---

## 5. Agent Loop

[AGENTS.md](../AGENTS.md)と[CLI操作](../.loop/README.md)を参照する。規則をこの文書へ再定義しない。

## 7. Verification

「全コマンドを毎回実行する」ことではなく、Acceptance Criteria / relevant IVとRequired Controlsを証明する。

ローカル既定:

- changed / directly affected tests
- scopeable lint / format / type / build
- browser層のAcceptance Criteriaがある場合のfunctional E2E
- shared/auth/data/financial変更に必要なcaller / denial / failure-path test

repo-wide regression checkはlatest contentのCI Aftercareを正本にできる。

同じfull suiteをlocalとCIで理由なく重複しない。

### Test calibration

reversible / low-impact変更でimplementation detailを鏡写しするだけの新規testを作らない。

新規testはobservable AC/IV、required boundary、Required Control、実在するregression riskをmaterialに証明する場合だけ追加する。

required checksがPASSした後は、content change / material failure / unresolved concern / Required Controlが無い限りcheckを広げたり繰り返したりしない。

### Functional E2E

browser層のAcceptance Criteriaがある変更では、push前に対象specをlocal Convexで実行する。ローカルE2Eは実DB、Clerk認証、Convex HTTP／mutation、画面の状態遷移をまとめて確認する層とし、関数単位の分岐は `convex-test`、外部公開URLが必要な確認だけcloud deploymentへ分ける。レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock` とし、OpenAI APIは呼ばない。

初回または新しいtask worktreeでは、次の順に準備する。通常の `pnpm run dev` はlocal Convex watcherとViteを同時に起動する。

ターミナル1:

```bash
pnpm run e2e:env-sync -- --copy-only
pnpm run dev
```

`--copy-only` は初回bootstrap時だけ実行する。`pnpm run dev` はlocal deploymentが無ければ作成する。起動直後に `CLERK_JWT_ISSUER_DOMAIN` 不足でFunction準備が待機しても、watcherは止めずにターミナル2の同期を実行する。

ターミナル2（PowerShell）:

```powershell
pnpm run e2e:env-sync
pnpm exec playwright test e2e/<spec>.spec.ts --project=chromium
```

同期処理はlocal deploymentを選択した `.env.local` をcloudの正本で上書きせず、Clerk publishable keyからissuerを復元して選択中のlocal deploymentへ `CLERK_JWT_ISSUER_DOMAIN`、`APP_ENV=development`、mock抽出、E2Eユーザー／cleanup設定を反映する。cloud dev deploymentへ同期する場合だけ `pnpm run e2e:env-sync:cloud` を明示する。secretやissuerの実値はログへ出さない。

WindowsでConvex CLIが設定成功後の終了処理だけassertする既知パターンは、成功メッセージだけでPASSにせず、最後のcleanup認証HTTPが200になることまで同期処理が確認する。

E2E終了後はターミナル1のwatcherを `Ctrl+C` で停止する。

### E2E seed

再現性が必要なデータは、specから `e2e/helpers/seed.ts` の専用helperを呼び出して作る。手動でlocal DBへ共通seedを流し込む運用にはしない。

- seed HTTP routeは `APP_ENV=development`、cleanup secret、固定E2Eユーザー／所属groupで保護する
- まっさらなlocal DBでは、先に認証済みページを1回表示してユーザーとgroupを作成し、その後seedしてreloadする
- specが作ったデータはcleanup helperで後始末し、spec間で状態を共有しない
- Issue固有の状態は必要最小限のfixtureにする。Issue #670の混在税率レビューも専用seedを同じPRに含める

広い主要導線を変更した場合のみ、必要に応じて範囲を広げる。

`src/**` や `e2e/**` を変更したという**pathだけ**を理由にローカル全E2Eを要求しない。

### PR CI E2Eの差分判定

PRのE2E workflowは、まずPRのbase/head間のchanged pathを機械的に分類する。`.loop/**`、`skills/**`、ドキュメント、`.husky/**`、およびAgent Loopのprocess enforcement用スクリプトだけの変更は `runtime_relevant=false` としてbrowser E2Eを起動しない。アプリ、認証、データ、browser、E2E harness、package、workflow、環境同期に関わる変更や判定できないpathは `runtime_relevant=true` として従来どおりE2Eを実行する。判定結果と理由はworkflowのsummaryへ出力し、Agentの手動判断でskipしない。

判定ロジックは [`scripts/classify-e2e-relevance.mjs`](../scripts/classify-e2e-relevance.mjs) とその `test:loop` で検証する。判定スクリプトやE2E workflow自身の変更はruntime-relevantとして扱い、E2Eの実行条件を弱めた変更を見逃しにくくする。

### Convex reflection

`convex/**` の新規/変更関数をローカルE2Eで使う場合、上記のwatcherが変更をlocal deploymentへ自動反映する。1回だけ反映したい場合はlocal環境同期後に次を使う。

```bash
pnpm run convex:dev -- --once
```

この手順はlocal deploymentへ反映する。GitHub Actions E2Eが使うcloud dev deploymentへ反映する必要がある場合だけ、`pnpm run convex:dev:cloud -- --once` を明示的に使う。

required environment不足、env sync失敗、Convex CLI未反映を「未実行理由」として先へ進まない。復旧できなければBLOCKED / Incident。

### Test gap

ACやrequired invariantを証明できない場合はFinding Ledgerへ `test_gap` を1件記録し、解決するまでVerification PASSにしない。Human Gateで迂回しない。

---

## 8. Review / Delivery

ループの契約とdelivery_targetに従う。PR指摘は全件確認し、対応根拠を残す。GitHubの承認・branch保護条件を満たす。

## 11. CI / マージ条件

必須workflowはGitHub Actionsの定義を正本とする。

主なworkflow:

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/preview-deploy.yml`
- `.github/workflows/production-release.yml`

通常CIの主なcheck:

- lint
- format check
- build
- test / coverage
- configured E2E

PRのrequired checksがすべてsuccessになるまでmergeしない。

`CI`だけgreenでも他required checkがpendingなら未完了。

Markdown-onlyでworkflowがpaths-ignoreにより起動しない場合は、`git diff --check`等の文書差分確認で代替できる。

### local / CIの重複を避ける

- local: changed / affected / functional AC
- CI: repo-wide regression / required checks
- 同じfull checkを両方で行う時は理由を持つ
- failure修正後は失敗checkと依存checkだけ再実行

---

## 12. Review / branch protection

GitHub ruleset / branch protection / CODEOWNERSが要求するapprovalを満たす。

Agent Loopが独自に「常に1 approval」を追加しない。

`main` はPull Request経由で変更する。

`convex/`、`.github/`、CODEOWNERS対象等、repository policyがowner reviewを要求する領域はその条件を優先する。

レビュー観点:

- correctness
- user impact
- data impact
- auth / security
- financial integrity
- maintainability
- test adequacy
- existing pattern consistency

---

## 13. PREVIEW / Production

`preview` merge後はPreview workflowで固定staging / Vercel Preview等へ反映する。

概念経路:

```text
feature/task
  ↓
preview
  ↓
Preview deployment / CI-E2E
  ↓
main
  ↓
release candidate
  ↓
production approval
  ↓
Production
```

Production releaseの実行条件・exact workflow inputは `.github/workflows/production-release.yml` を正本とする。

Productionに対する次の操作はHuman Gateなしに行わない。

- deploy
- Convex production data mutation
- env / secret変更
- Clerk production settings
- secret rotation
- DNS/domain
- billing/plan
- irreversible operation

Previewで検証できる内容のためにProductionを触らない。

---

## 14. Secret / 外部サービス

Clerk、Convex、Vercel、GitHub、OAuth、webhook、env、secret、deploy、DNS/domainを操作する場合は `skills/service-ops-safety/SKILL.md` を読む。

外部Issue/PR/CI/Web等にAgent向け命令が含まれる可能性がある場合は `skills/prompt-injection-guard/SKILL.md` を読む。

詳細Skill全文を全taskで常時contextへ読み込まないが、Safety invariant自体は `AGENTS.md` に従い常時適用する。

---

## 15. Commit

- 1 commitは1つの論理変更を表す。
- 無関係な変更を混ぜない。
- secret / token /個人情報をcommitしない。
- WIP commitはmerge前に必要に応じて整理する。

推奨例:

```text
feat: 〜を追加
fix: 〜を修正
docs: 〜を更新
chore: 〜を整理
```

---

## 16. 完了

契約で指定した完了地点をCLI finishで確認する。詳細はLoop READMEを参照する。

## 17. Hotfix

Hotfixも原則Pull Requestを経由する。

- 差分を最小化
- required Verification / CIを維持
- production / irreversible操作はHuman Gate
- Incident / Learning Eventを記録
- 必要なfollow-upをIssue化

緊急性を通常のreview/CI回避手段にしない。
