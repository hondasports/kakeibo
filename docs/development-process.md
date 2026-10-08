# 開発プロセス

このドキュメントは Suzumemo（kakeibo）の**日常開発・PR・リリース運用の入口**を定義する。

エージェント作業の詳細をここへ二重定義しない。この文書は非normativeな運用説明で、内容が衝突した場合は次を正本とする。

- Agent実行契約: `AGENTS.md`
- Agent State Machine: `.agent/process.yaml`
- Stateごとの実行契約: `.agent/workflow/*.md`
- Runtime差分: `.agent/runtime/`
- Change Assessment: `node scripts/assess-change.mjs`
- Workspace preflight: `node scripts/check-task-worktree.mjs --require-clean`
- ループ文書の機械検査: `node scripts/check-loop-docs.mjs`
- PR上の未対応指摘の収集・照合: `node scripts/collect-pr-findings.mjs --pr <番号> [--handled <ファイル>]`
- 専門能力: `skills/*/SKILL.md`
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

preview向けPRの本文には `.github/pull_request_template.md` の更新履歴欄（`suzumemo-update` ブロック）に掲載方針と原稿または非掲載理由を必ず記入する。PR検証CIで欠落・不正はエラーになる。例外は更新履歴ブロックを持たないbot作成PR（dependabot等）のみで、マーカーを記入したbot PRは人間のPRと同じく検証される。

`PR created` はcheckpointであり完了ではない。ユーザーが明示的に「PR作成まで」と指定しない限り、latest PR contentのCI・review・conflict・mergeabilityを確認する。

公開前にstaged diffを確認し、タスク固有の作業ファイルや秘密値を含めない。

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

`docs/`、`README.md`だけのpure docsは理由を記録して例外にできる。ただし次はpure docs扱いしない。

- `AGENTS.md`
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

- 要求工程で確定した目的・範囲・受入条件
- materialな仕様の擦り合わせ / Human Gate
- 重要な設計判断と見送った案
- 実装中にmaterially変わった判断
- blocking finding / follow-up
- Delivery / Aftercareの最終結果

残さなくてよいもの:

- Agentごとの逐次作業ログ
- 確認ごとの開始/終了コメント
- 一時コマンド一覧
- `implementation-plan.md`、`delivery-notes.md`等の一時ファイル

一時的な設計書・実装計画は `docs/` に増やさない。

---

## 5. Agent Harness

`AGENTS.md` はRuntime共通契約、`.agent/process.yaml` はState Transitionの正本とする。基本Stateは `REFINE / EXECUTE / REVIEW / AFTERCARE`、例外Stateは `INCIDENT / HUMAN_GATE`。Workflow本体をCodex・Devin・Claude Codeの個別設定へ複製しない。

具体的な開始・再開・状態保存は [Agent Harness操作手順](agent-harness.md) を参照する（State・遷移・上限値の正本一覧は [Agent Harness State仕様](agent-harness-states.md)）。

軽量化を実装する際は [Agent Harness設計](agent-harness-design.md) を正本とする。この設計は段階的に実装中であり、本節の現行運用とState Transitionを設計文書だけで変更しない。

### REFINE

Issueは詳細仕様を必須としない。Agentはrepository、既存仕様、テストを調査してHuman Requestを実装可能なAgent Specへ育てる。調査で解ける疑問は自力で解決し、既存patternに沿う可逆・低影響な判断はAssumptionとして記録する。Product / UX / Security / Data semanticsをmaterially変える未確定事項だけHUMAN_GATEへ送る。

Spec GateはGoal、1件以上のAcceptance Criteria、Non-goals、Assumptions、Verification Strategy、material open decisionが0件であることを要求する。

### EXECUTE

実装・targeted test・debug・修正・再検証は同じAgent Run内で回す。HarnessはHOWを細分化せず、Machine FloorとExit Contractだけを強制する。

### Machine Floor

`scripts/assess-change.mjs` はPredicted Risk、差分からのMachine Risk、Agent Assessmentを統合する。Final Riskは最も高いTierを採用し、Agentは最低条件を引き下げられない。同じ考え方をRequired SkillsとVerification Floorにも適用する。

評価CLIは引数省略時にPR baseまたは明示されたbaseからcommit済み・未commit・未追跡の差分を取得する。`--paths` は診断用途のみで、タスクとCIのゲートはGit実差分を再取得する。

Machine Riskはschema/migration、認証・認可、削除/retention、Agent orchestration、外部write/webhook等を決定論的にT3 floorへ引き上げる。判定はパスルールに加えて差分の中身（変更hunk行の危険シンボル: `getUserIdentity`・`ctx.db.delete`・`defineTable`・`fetch(` 等）でも行い、ファイル名に依らず `convex/**`・`src/**` のコード変更を捕捉する（content ruleは `.test.`/`.spec.` ファイルでは発火しない）。hunkの読み取りはcontent rule対象のpathが含まれる変更だけで行い、その読み取りに失敗した場合はfail-closedでT3になる（`diff_read_failed`）。どちらで検知したかは `floorTriggerDetails` の `source`（`path`|`content`）で区別する。より高いRiskが必要とAgentまたはReviewerが判断した場合は上積みする。

### REVIEW

T1はセルフレビュー可。T2で未解決の挙動前提がある場合とT3は独立Reviewerを必須とする。Reviewerはfresh contextで目的・Acceptance Criteria・差分・検証結果・関連caller/契約を読み、実装担当の結論を先に見ずに独立評価する。

修正ループの回数を減らすため、PR作業を許可されたタスクは初回REVIEW進入時にdraft PRを作り、外部レビュー（CodeRabbit）を内部レビューと並行させて同じラウンドで指摘を処理する。Reviewerは各ラウンドで指摘を重要度付きで一度に出す。full unitはREVIEW中にReviewerと並行して完了させ、REVIEW cleanの条件とする（[Agent Harness操作手順](agent-harness.md#レビュー) 参照）。

### AFTERCARE / Persistent State

PR作成後はCI・レビュー指摘・承認・競合・mergeabilityをlatest HEADで確認する。タスク状態はIssue / PRを正本とし、Human Requestは保持する。Agent Spec・Machine-readable state・検証証跡を分離して残し、別SessionでもGitHubと実HEADを照合して再開できるようにする。状態はGitメタデータ内に作業キャッシュを保存し、PR本文の状態ブロックへ同期する。HEADまたはbase更新時は検証・レビューを失効させる（検証証跡の再利用はない）。Machine分類が不変ならAgent評価を引き継ぐ。PR本文の状態ブロックは復元とPR gateに必要な範囲へ圧縮し、完全なhistoryはGitメタデータに残す（[Agent Harness操作手順](agent-harness.md#prとaftercare) 参照）。

E2Eが必須と判定された変更でブラウザ受入条件がない場合は、PR CIで実行し、AFTERCAREでpublic/authenticated両方の成功を要求する。文書・工程管理のみなど差分判定でE2E対象外となる変更には、E2E成功を必須条件として追加しない。実行対象の判定は「PR CI E2Eの差分判定」に従う。

### Task Tier

Core Harnessはモデル非依存。タスク強度はTier（T1〜T3）に一本化され、Profile機構は廃止した。

thorough検証（lint/unit/build必須）はTierと評価軸から機械判定する：final tierがT3、またはuncertaintyがknown_pattern以外、またはblast_radiusがshared_or_system_wideの場合。`--profile` は後方互換のため受理されるが無視される。Risk Floor・Human Gate・State Transitionは常に維持する。Runtime固有設定は `.agent/runtime/` に置く。

ループ文書自身（AGENTS.md・README・`.agent/workflow/`・skills/・この文書）の整合は `node scripts/check-loop-docs.mjs` が機械検査する。
## 6. Verification

「全コマンドを毎回実行する」ことではなく、受入条件と関連する不変条件、必須確認を証明する。受入条件は要求工程でbullet化したものを全件照合し、`受入条件 → 確認方法 → 期待結果/実結果 → 対象commit → 証跡` の対応とともに検証した内容・未検証・残課題をPR・作業報告へ記録する。変更後は影響する条件を未検証に戻す。

現行CLIではHEAD/base更新時に検証・レビューを失効させる。過去の結果は調査の参考として参照できるが、旧HEAD/baseの証跡を現在の必須確認の成功として扱わない（#953で再利用機構は撤去）。

ローカル既定:

- changed / directly affected tests
- scopeable lint / format / type / build
- browser層の受入条件がある場合のfunctional E2E
- shared/auth/data/financial変更に必要なcaller / denial / failure-path test

repo-wide regression checkはlatest contentのCI Aftercareを正本にできる。

同じfull suiteをlocalとCIで理由なく重複しない。

### Test calibration

reversible / low-impact変更でimplementation detailを鏡写しするだけの新規testを作らない。

新規testは観測可能な受入条件・不変条件、required boundary、必須確認、実在するregression riskをmaterialに証明する場合だけ追加する。

required checksがPASSした後は、content change / material failure / unresolved concern / 必須確認が無い限りcheckを広げたり繰り返したりしない。

### Functional E2E

push前の検証は `.husky/pre-push` から走る `pnpm run verify:prepush` に一本化する。内容は型（`tsc -b`）→ lint/format → `vitest related`（差分に関係するunit）→ `test:process`（`scripts/`・`.agent/`・`docs/agent-harness*`変更時のみ）→ 対象E2E（`e2e:isolated`）。E2Eの対象specは `e2e/spec-map.json` の変更パスglobで選び、`@smoke` のspecを最低ラインとして必ず合流させる。mapにないパスを変更した場合は安全側に `@smoke` + `@public` 全件を選び、map追記を促すファイル名を表示する。ローカル実行はマージ判定材料ではない（判定はCIのcheckが正本）。

CIで失敗したテストをローカルで再現するときは `--include` で対象を追加する（複数指定可）。

```bash
pnpm run verify:prepush -- --include e2e/settings.spec.ts --include src/features/foo/foo.test.ts
```

E2Eの実行には事前条件がある。満たさない場合はE2Eを実行せずに満たしていない条件と対処方法を表示して止まる。どうしても迂回する場合は `git push --no-verify` を使い、その事実をPR本文に記載する。

- Convex local backendのバイナリが取得済み、またはダウンロードできるネットワークがあること（convex CLIのキャッシュは `~/.convex` 配下。制限された環境では先に `pnpm run e2e:isolated -- --probe` で取得しておく）
- `5173`（Vite dev、`pnpm run dev` 起動中は衝突するので停止する）と `3210`/`3211`（local backend）のポートが空いていること
- `.env.local` に `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `E2E_CLERK_USER_EMAIL` があること（`docs/environment-variables.md` 参照）
- PlaywrightのChromiumがインストール済みであること（`pnpm exec playwright install chromium`）

ローカルE2Eは実DB、Clerk認証、Convex HTTP／mutation、画面の状態遷移をまとめて確認する層とし、関数単位の分岐は `convex-test`、外部公開URLが必要な確認だけcloud deploymentへ分ける。レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock` とし、OpenAI APIは呼ばない。

初回または新しいtask worktreeでは、次の順に準備する。通常の `pnpm run dev` はlocal Convex watcherとViteを同時に起動する。

Node.jsとpnpmはリポジトリの `mise.toml` と `package.json` から選択されるため、新しいworktreeでは最初に次を実行する。

```bash
mise install
```

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

CIと同じ「匿名使い捨てbackend」構成でE2Eを実行したい場合は `pnpm run e2e:isolated -- e2e/<spec>.spec.ts` を使う。`CONVEX_AGENT_MODE=anonymous` のlocal deploymentが起動し、現在のworktreeの `convex/**` がpushされてからspecが走る。終了時にbackendと `.env.local` は元の状態へ戻る。CIでこけたspecのローカル再現にも使える。

注意: CIではジョブごとにVM自体が使い捨てだが、ローカルではanonymous deploymentの状態が `.convex/local/default/` に持続するため、以前の実行のDBデータやcredentialが残る場合がある。seed/cleanup系のspecは前回実行の残骸に影響されうることを前提に動く（CIより緩い）。真にクリーンな状態で試したい場合は `.convex/local/default/` を削除してから実行する。

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

PRのE2E workflowは、まずPRのbase/head間のchanged pathを機械的に分類する。`skills/**`、ドキュメント、`.husky/**`、および工程管理用スクリプト（`scripts/review-depth.mjs`、`scripts/check-task-worktree.mjs`、`scripts/check-loop-docs.mjs`、`scripts/collect-pr-findings.mjs`、`scripts/suggest-skills.mjs`）だけの変更は `runtime_relevant=false` としてbrowser E2Eを起動しない。アプリ、認証、データ、browser、E2E harness、package、workflow、環境同期に関わる変更や判定できないpathは `runtime_relevant=true` として従来どおりE2Eを実行する。判定結果と理由はworkflowのsummaryへ出力し、Agentの手動判断でskipしない。

判定ロジックは [`scripts/classify-e2e-relevance.mjs`](../scripts/classify-e2e-relevance.mjs) とその `test:process` で検証する。判定スクリプトやE2E workflow自身の変更はruntime-relevantとして扱い、E2Eの実行条件を弱めた変更を見逃しにくくする。

CIで実行するbackendは共有cloud devではなく、ジョブごとの `CONVEX_AGENT_MODE=anonymous` な使い捨てlocal deployment（`scripts/start-ci-convex.mjs`）である。PR HEADの `convex/**` がpushされてからPlaywrightが走るため、「CIでこける→ローカルで確認→またCIでこける」の往復が起きにくい。共有状態を持たないのでpublic/authenticatedの直列化もなく、draft PRでもE2Eが走る。

### Convex reflection

`convex/**` の新規/変更関数をローカルE2Eで使う場合、上記のwatcherが変更をlocal deploymentへ自動反映する。1回だけ反映したい場合はlocal環境同期後に次を使う。

```bash
pnpm run convex:dev -- --once
```

この手順はlocal deploymentへ反映する。GitHub ActionsのE2EはPR/ジョブ専用の匿名使い捨てlocal deploymentで実行するため、cloud devへの反映が必要なのはローカルから共有cloud devを検証したい場合だけ、そのときは `pnpm run convex:dev:cloud -- --once` を明示的に使う。

required environment不足、env sync失敗、Convex CLI未反映を「未実行理由」として先へ進まない。復旧できなければBLOCKED / Incident。

### Test gap

受入条件や不変条件を証明できない場合は未検証項目としてPR・作業報告へ記録し、解決するまで完了にしない。Human Gateで迂回しない。

---

## 7. Review / Delivery

ユーザー指定の完了地点に従う。PR指摘は `node scripts/collect-pr-findings.mjs` で機械収集して全件確認し（inlineスレッド・全stateの非空レビュー本文・PR会話コメント）、修正 or 棄却の根拠を残す。レビュー本文と会話コメントはresolve状態を持たないため、対応済みのfinding idと確認した候補のupdatedAtをIssue/PRの記録に残し、`--handled` で `unhandledCount: 0` を「指摘なし」と判定する（未解決threadはresolveまで常に未対応）。`bodyTruncated`・`commentsTruncated` の項目は記載URLの全文を読むまで確認済みとしない。指摘対応はまとめて1 pushで行い、pushごとのCI起動を抑える。観測した最新HEADに対して実行中は再観測、失敗は修正・再検証・push、新規指摘は修正ループ、必要承認だけ不足は人間待ち、必要条件充足はHEAD不変を再確認して完了とする判断表に従う（`.agent/workflow/aftercare.md`）。GitHubの承認・branch保護条件を満たす。

## 8. CI / マージ条件

必須workflowはGitHub Actionsの定義を正本とする。

主なworkflow:

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/preview-deploy.yml`
- `.github/workflows/production-release.yml`

各workflowのNode.jsは `jdx/mise-action@v4` でリポジトリの `mise.toml` から導入する。pnpmは `package.json` の `packageManager` に合わせて `pnpm/action-setup` で導入し、ローカルとCIでNode.jsの選択元を分けない。

通常CIの主なcheck:

- lint
- format check
- build
- test / coverage
- configured E2E

PRのrequired checksがすべてsuccessになるまでmergeしない。

`CI`だけgreenでも他required checkがpendingなら未完了。

`ci.yml` の `push` triggerは `preview` のみ。`main` への merge commit は `preview -> main` の PR で同一ツリーが検証済みのため、main push では `ci.yml` を再実行しない。同じ理由で `production-release.yml` の preflight も main push 時は lint / format / test をスキップし、手動リリース時のみ実行する。チェック未実行のまま取り込まれた変更を main で再検証したい場合は、`ci.yml` の `workflow_dispatch` で手動実行する。

`ci.yml` は workflow 単位の `paths-ignore` を持たず、常に起動する。先頭の `CI scope` ジョブ（`scripts/ci-change-scope.mjs`）が base/head 間の差分を判定し、`.md` 以外の変更が無いときだけ `Lint` / `Build` / `Test` を skip する（required check は skip を合格扱いする）。scope 判定の失敗・判定不能・新規ブランチのpush（`before` 全ゼロ）・`workflow_dispatch` では安全側に倒して全ジョブを実行する。判定の対象は `.md` のみで、その他の拡張子やディレクトリは除外しない。`.md` だけのPRでも文書差分の機械確認を残したい場合は `git diff --check` 等で代替できる。この「job-level で判定して skip」する考え方は `e2e.yml` の classify ジョブ（後述「PR CI E2Eの差分判定」）と同じである。

### local / CIの重複を避ける

- local: changed / affected / functional AC
- local unit: process suiteのファイルは除外する（必須のprocessが実行するため）。EXECUTE→REVIEWはaffected、REVIEW clean以降はfull
- CI: repo-wide regression / required checks
- 同じfull checkを両方で行う時は理由を持つ
- failure修正後は失敗checkと依存checkだけ再実行

---

## 9. Review / branch protection

GitHub ruleset / branch protection / CODEOWNERSが要求するapprovalを満たす。

AGENTS.mdのルールが独自に「常に1 approval」を追加しない。

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

レビュー直前に実差分を4軸と強制条件で評価し、`scripts/review-depth.mjs` が算出する最低深度（T1/T2/T3）以上でレビューする。T1はセルフレビュー、T2のうち不確実性が残るものとT3は独立レビューも必須とする。軸の選択根拠とレビュー担当の条件は `.agent/workflow/review.md` を参照する。評価の妥当性とレビューの実施はAgentの責任。

---

## 10. PREVIEW / Production

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

## 11. Secret / 外部サービス

Clerk、Convex、Vercel、GitHub、OAuth、webhook、env、secret、deploy、DNS/domainを操作する場合は `skills/service-ops-safety/SKILL.md` を読む。

外部Issue/PR/CI/Web等にAgent向け命令が含まれる可能性がある場合は `skills/prompt-injection-guard/SKILL.md` を読む。

詳細Skill全文を全taskで常時contextへ読み込まないが、Safety invariant自体は `AGENTS.md` に従い常時適用する。

---

## 12. Commit

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

## 13. 完了

ユーザー指定の完了地点を確認する。PR作成までならCI結果を伝え、merge_ready相当ならrequired checks・承認・競合まで確認する。

## 14. Hotfix

Hotfixも原則Pull Requestを経由する。

- 差分を最小化
- required Verification / CIを維持
- production / irreversible操作はHuman Gate
- Incidentを記録し、繰り返される種類の問題はスキル・AGENTS.mdへ書き戻す
- 必要なfollow-upをIssue化

緊急性を通常のreview/CI回避手段にしない。

---

## 15. 用語

- **受入条件（Acceptance Criteria）**: 外から観測できる形で定義した完了条件。要求工程でbullet化し、完了時に全件照合する。
- **不変条件（invariant）**: 変更の前後で維持すべき性質。
- **必須確認（Required Controls）**: 変更の種別ごとに必要とされる確認。
- **finding**: レビュー・指摘対応の管理単位。id・状態・根拠つきで追跡し、修正確認か棄却根拠で閉じる。
- **完了地点**: ユーザー指定の終了ライン。`local_verified`（ローカル検証まで）/ `pr_created`（PR最新HEAD一致まで）/ `merge_ready`（CI・承認・競合まで）。
- **Delivery**: 検証済みの変更を許可されたbranch / PRへ公開する工程。
- **Human Gate**: 明示承認なしに実行しない操作（production・不可逆操作等）。
- **T1/T2/T3・floor trigger**: `scripts/review-depth.mjs` が実差分評価から算出するセルフレビュー最低深度と、その強制条件。
- **Checker chain**: 必須条件（セルフレビュー必須項目、policy・ユーザー指定のCIと承認）と補助観点（利用可能なボット指摘）に分けた確認系列。自己評価は独立レビューの代替にならない。
- **収束（convergence）**: open findingが0件（全件に根拠あり）になった状態。受入条件を満たせない指摘の先送りは収束に数えない。
- **再開情報**: 区切り・待機時に Issue / PR へ残す再開用の最小情報（目的と完了地点・branch/HEAD・未コミット作業・未解決findingと根拠・検証証跡・次の1手・外部待ち解除条件）。
