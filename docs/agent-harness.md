# Agent Harness操作手順

このCLIはタスクごとの仕様・Profile・評価・検証・レビュー・停止条件を接続する。AGENTS.mdを入口としてAgentが起動する。Codex/Devin自体を自動起動したり、実行中のモデルの推論設定を変更する機能はない。autonomy/delegation/contextはAgentが遵守する方針、verification=thoroughは追加のlocal検証として機械適用する。

ProfileはREFINE終了時に、Agentが記録した評価（`blast_radius`・`uncertainty`・検証負荷）から規則で自動判定される。`--profile` の明示指定は常に優先される。実装中に評価入力が変わった場合だけ再判定し、自動選択は上位へしか移動しない。下位への変更にはユーザー指定または根拠記録が必要である。選択値・選択元・参照した評価・根拠・規則バージョンは状態に記録され、PR gateでも照合される。

本書は現行CLIの操作手順を記載する。軽量化の設計正本は [Agent Harness設計](agent-harness-design.md) を参照する。出力・検証・証跡管理のさらなる変更は未実装であり、現在は本書の手順を使う。

## 開始と再開

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。Agentが毎回新規作成するSkillではない。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。

1. 専用worktreeでclean baselineを確認する。
2. 作業仕様JSONをリポジトリ外（例: `/tmp/spec.json`）に作る。必須フィールドは `.agent/schema/spec.schema.json` を参照。`predictedRisk` も必須。Human Requestを改変せずGoal/AC/Non-goals/Assumptions/Verification Strategyを整理する。
3. 次を実行し、現在のworkflowを読む。開始時のProfileは仮のdefaultであり、REFINE終了時に自動判定で確定される。Profileを明示する場合は `--profile <name>` を付ける（指定値は常に優先される）。

```bash
node scripts/loop-runner.mjs --init /tmp/spec.json --task issue-123 --runtime codex --implementer session-123
```

Devinでは `--runtime devin` を指定する。旧来のモデル指定オプションは互換のため受理されるが、何も記録・参照しない。

4. REFINEの評価を記録し、EXECUTEへ進む。`--assessment` のJSONには `risk_assessment`・`tier_rationale`・`applied_tier` に加えて、Profile判定の入力となる `verification_load: {level: routine|complex, rationale}` を含める。これらの入力が欠ける場合、`ready` はREFINEの不足条件として拒否される。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json
node scripts/loop-runner.mjs --event ready
```

base既定値は `origin/preview`。別baseは開始時に `--base` で指定する。作業状態はworktree固有のGitメタデータに保存する。通常の再開は引数なしで実行する。`--state` は保存済み状態との一致確認専用であり、状態を飛ばす指定ではない。

通常出力は要約だけを返す。taskId・state・head/base・risk・profile・missing・verification・openFindings・aftercare・next を含み、spec・history・configuration・評価本文・ログ本文は含まない。不足要件の根拠が必要な場合だけ `--explain`、検証証跡のmanifestだけ `--artifacts`、状態スナップショットは `--status` で確認する。状態ブロック全体は `--export` / `--export-file <path>` / `--sync-pr` でのみ出力する。

仕様の修正はREFINEで `--spec /tmp/spec.json`。未決事項があれば `--event decision_required --exit /tmp/exit.json` で停止する。exitにはreasonを記録する。Human Gateの解除には `approval: {"source":"user","reference":"対象と操作を承認したユーザー指示の参照"}` が必要。承認記録はAgentの責任であり、このJSONだけで人間の本人性を証明するものではない。

## 実装と検証

変更後に実差分を評価し、必要Skillを読んで記録する。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json --skills workspace-preflight,security-review
```

assessmentは `scripts/review-depth.mjs` のrisk_assessment・tier_rationale・applied_tier形式に `verification_load` を加えた形。EXECUTE/REVIEWで再提出した評価が影響範囲・不確実性・検証計画の変化を示す場合だけProfileを再判定する（自動選択は上位へのみ）。通常の修正・テスト実行・CI待ち・コミットでは再判定しない。runnerはGitの実差分を取得し、Spec予測・Machine・Agent・Reviewer・過去の最高Riskを統合する。診断CLIの `--paths` はrunner/CIの評価を差し替えられない。

変更をcommitしてから検証する。pre-commitは初期化済みEXECUTE状態を要求する。

```bash
node scripts/loop-runner.mjs --verify process
node scripts/loop-runner.mjs --verify lint
node scripts/loop-runner.mjs --verify unit
node scripts/loop-runner.mjs --verify build
node scripts/loop-runner.mjs --event ready
```

必要な検証のみ実行する。固定コマンドをCLIが起動し、終了結果を現在HEAD/baseへ紐づける。processはドキュメント整合とprocessテスト、lintはlintとformat、unitはVitest全体、buildは本番ビルド。dirty treeでは証跡を確定しない。

検証ログは `git rev-parse --git-path agent-evidence` 配下にartifactとして保存され、worktreeを汚さない。証跡manifestは実実行の `run`（HEAD/base・時刻・時間）と適用対象の `appliesTo`（HEAD/base・head tree・feature patch SHA-256・contract version）を分けて記録し、exit summary・artifactのpath/SHA-256/bytesを保持する。成功時のログ本文は通常出力に含めない。失敗時のエラーはexit code・artifact path・末尾行だけを返し、全文はartifactを参照する。

HEAD/base更新で古い検証・レビューは失効するが、verification証跡だけは安全に部分再利用できる。feature patch（merge-base差分のSHA-256）と検証対象のhead treeがともに不変な場合のみ `appliesTo` を新revisionへ更新し、`reuse.from` に元revisionを記録する。同一のtree入力には同一の結果を再現できる——入力推論は行わない。ツールチェーン・gitignore済みファイルなどtree外の入力はfingerprintできない残差だが、必須確認はCIが実HEAD上で再実行するため再利用はローカル短絡に留まる。`run` は実実行の記録のまま書き換えない。fingerprintの計算不能・contract version不一致・必須metadata欠落はすべてfail-closedで失効する。review・aftercare・assessment・skillsは再利用しない。`git fetch origin` 後も状態を再確認する。

同じ検証コマンド・終了コードが連続して3回失敗した場合はINCIDENTへ停止する。修正前後で原因が変わったと判断する場合も、INCIDENTのresolutionに切り分け証拠を記録して解除する。単なる再試行でカウンタをリセットしない。

## レビュー

Reviewerへ目的・AC・実差分・検証結果・関連契約を渡す。T3、未解決前提のあるT2はfresh contextの独立Reviewerが必要。レビュー結果JSONには次を含める。

- `head`、`baseHead`: 対象のcommit SHA
- `reviewer`: 実装担当と区別できるID
- `independent`: 独立レビューならtrue、`context`: `fresh`
- `assessment`: risk_assessment・tier_rationale・applied_tier
- `evidence`: レビュー範囲と根拠の文字列配列
- `acceptanceCriteria`: 全ACの `{id, evidence}` 配列
- `findings`: `{id, status: open | fixed | dismissed, evidence}` 配列（0件は空配列）

```bash
node scripts/loop-runner.mjs --review /tmp/review.json
node scripts/loop-runner.mjs --event clean
```

Reviewerの本人性や実施内容はAgentが正しく記録する責任を持つ。CLIは担当ID、fresh宣言、HEAD、必須深度、全AC、残存findingを検査する。過去findingは次roundにも同じIDで引き継ぐ。

独立Reviewerへ渡す材料は `--review-packet <dir>` で生成する。packet.json（目的・AC・changedPaths・risk・verification・reuseCandidates）、diff.patch、task-summary.json、verification-manifest.json、review-template.json（validateReview準拠の雛形）、contracts/（AGENTS.md・workflow-review.md・required-skills）を書き出す。REVIEW状態かつclean treeが必須で、生成物はcommitしない。reuseCandidatesにはfeature patch fingerprintと再利用済みkindだけを記録し、review証跡は再利用しない。

```bash
node scripts/loop-runner.mjs --review-packet /tmp/issue-900-review-packet
# dirはworktree外を推奨する（内側だと生成後にtreeが汚れる）
```

指摘修正は `--event findings --exit /tmp/exit.json` でEXECUTEへ戻る。exitにはreasonを必須とし、3roundごとにreassessmentを要求する。9round到達はINCIDENTへ停止する。CI修正はci_failureイベントで同様に戻り、3round上限を持つ。

## PRとAFTERCARE

```bash
node scripts/loop-runner.mjs --export > /tmp/agent-state.md
node scripts/loop-runner.mjs --export-file /tmp/agent-state.md
```

`--export` は標準出力、`--export-file <path>` は指定ファイルへ同じ状態ブロックを書き出す。この状態ブロックをPR本文へ含める。Human Request、説明、更新履歴ブロックとは分離する。PR作成後・状態更新後は `--sync-pr <番号>` で既存本文を保持してブロックを更新する。この操作はGitHubへのwriteであり、ユーザーが許可したPR作業の範囲でのみ実行する。

観測用のmetricsは `git rev-parse --git-common-dir` 配下の `agent-metrics.jsonl` へ1行JSONで追記する。verify（kind・durationMs・result・artifactBytes・失敗signature）、revision_changed（reused/invalidated件数）、transition、aftercare、watch_aftercare（poll回数）、review_packetを記録する。common dir配下なのでlinked worktreeを跨いで集計でき、worktreeは汚れない。追記はbest-effortであり、失敗しても本処理を止めない。

`Agent harness` CIはMarkdownのみの変更でも動き、実PR HEAD/base・実差分・仕様・検証・レビューを照合する。非bot PRは状態ブロック必須。GitHubが認識するdependabot/github-actionsのBot投稿は例外とし、processテストとドキュメントチェックは実行する。既存PRもこのworkflowが走る時点で状態ブロックが必要になる。CIを必須チェックへ登録するbranch protection設定は別途管理者の操作が必要であり、このPRでは権限設定を変更しない。

```bash
node scripts/loop-runner.mjs --aftercare 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --event ready --handled /tmp/handled.txt
node scripts/loop-runner.mjs --sync-pr 123
```

CI完了を待つ場合は `--watch-aftercare` を付けてpollできる。状態変化時だけcompact event（ready・pending・failed・mergeability・finding数・head/base）を返し、変化なしのpollは出力しない。間隔は `--interval-seconds`（既定60秒）、上限は内部deadline（既定15分）。readyになった時点で通常のaftercare証跡を記録する。

```bash
node scripts/loop-runner.mjs --aftercare 123 --watch-aftercare --interval-seconds 30
```

aftercareおよびDONEへの遷移直前はGitHubを再取得し、最新HEAD/base、CI全体、必須チェック、approval、mergeability、ページ取得完了、未処理指摘0件を確認する。E2E必須ならpublic/authenticated両方の成功を要求する。handledは `scripts/collect-pr-findings.mjs` の `<finding id> <updatedAt>` 形式。本文が切れている候補は全文を読んで判定する。収集コマンドのPASSだけではaftercareを完了できない。

別worktreeから再開する場合は対象branch/HEADをcheckoutし、`--restore-pr <番号>` で復元する。復元先に既存タスクがある場合や別branchの状態は拒否する。PR本文のsnapshotが古い場合は過去のRisk・finding・counterを保持し、検証を失効してEXECUTEへ戻す。復元前にcurrent PR HEAD/baseをfetchしてcheckoutする。PR本文への同期でチェックが再実行された場合はその完了を確認する。DONEはmerge_readyを表し、merge自体はユーザーの許可に従う。
