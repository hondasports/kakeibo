# Agent Harness操作手順

このCLIはタスクごとの仕様・Profile・評価・検証・レビュー・停止条件を接続する。AGENTS.mdを入口としてAgentが起動する。Codex/Devin自体を自動起動したり、実行中のモデルのreasoning effortを変更する機能はない。Profileのeffortはruntimeへ渡す推奨値であり、ホスト側の適用を確認できない場合は適用済みと報告しない。autonomy/delegation/contextはAgentが遵守する方針、verification=thoroughは追加のlocal検証として機械適用する。

本書は現行CLIの操作手順を記載する。軽量化・REFINE終了時のProfile自動判定の実装仕様は [Agent Harness設計](agent-harness-design.md) を参照する。自動判定、Runtimeへの設定適用、出力・検証・証跡管理の変更は未実装であり、現在は本書の手順を使う。

## 開始と再開

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。Agentが毎回新規作成するSkillではない。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。

1. 専用worktreeでclean baselineを確認する。
2. 作業仕様JSONをリポジトリ外（例: `/tmp/spec.json`）に作る。必須フィールドは `.agent/schema/spec.schema.json` を参照。`predictedRisk` も必須。Human Requestを改変せずGoal/AC/Non-goals/Assumptions/Verification Strategyを整理する。
3. 次を実行し、解決されたProfileと現在のworkflowを読む。正確なモデルIDが取得できない場合は `unknown` を渡し、standardへフォールバックした事実を報告する。

```bash
node scripts/loop-runner.mjs --init /tmp/spec.json --task issue-123 --model unknown --runtime codex --implementer session-123
node scripts/loop-runner.mjs --event ready
```

Devinでは `--runtime devin` を指定する。base既定値は `origin/preview`。別baseは開始時に `--base` で指定する。作業状態はworktree固有のGitメタデータに保存する。通常の再開は引数なしで実行する。`--state` は保存済み状態との一致確認専用であり、状態を飛ばす指定ではない。

仕様の修正はREFINEで `--spec /tmp/spec.json`。未決事項があれば `--event decision_required --exit /tmp/exit.json` で停止する。exitにはreasonを記録する。Human Gateの解除には `approval: {"source":"user","reference":"対象と操作を承認したユーザー指示の参照"}` が必要。承認記録はAgentの責任であり、このJSONだけで人間の本人性を証明するものではない。

## 実装と検証

変更後に実差分を評価し、必要Skillを読んで記録する。

```bash
node scripts/loop-runner.mjs --assessment /tmp/assessment.json --skills workspace-preflight,security-review
```

assessmentは `scripts/review-depth.mjs` のrisk_assessment・tier_rationale・applied_tier形式。runnerはGitの実差分を取得し、Spec予測・Machine・Agent・Reviewer・過去の最高Riskを統合する。診断CLIの `--paths` はrunner/CIの評価を差し替えられない。

変更をcommitしてから検証する。pre-commitは初期化済みEXECUTE状態を要求する。

```bash
node scripts/loop-runner.mjs --verify process
node scripts/loop-runner.mjs --verify lint
node scripts/loop-runner.mjs --verify unit
node scripts/loop-runner.mjs --verify build
node scripts/loop-runner.mjs --event ready
```

必要な検証のみ実行する。固定コマンドをCLIが起動し、終了結果を現在HEAD/baseへ紐づける。processはドキュメント整合とprocessテスト、lintはlintとformat、unitはVitest全体、buildは本番ビルド。dirty treeでは証跡を確定しない。HEAD/base更新で古い検証・レビューは失効する。不変性を証明した検証証跡の再利用は未実装であり、過去の結果を現在HEAD/baseの検証成功として扱わない。`git fetch origin` 後も状態を再確認する。

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

指摘修正は `--event findings --exit /tmp/exit.json` でEXECUTEへ戻る。exitにはreasonを必須とし、3roundごとにreassessmentを要求する。9round到達はINCIDENTへ停止する。CI修正はci_failureイベントで同様に戻り、3round上限を持つ。

## PRとAFTERCARE

```bash
node scripts/loop-runner.mjs --export > /tmp/agent-state.md
```

この状態ブロックをPR本文へ含める。Human Request、説明、更新履歴ブロックとは分離する。PR作成後・状態更新後は `--sync-pr <番号>` で既存本文を保持してブロックを更新する。この操作はGitHubへのwriteであり、ユーザーが許可したPR作業の範囲でのみ実行する。

`Agent harness` CIはMarkdownのみの変更でも動き、実PR HEAD/base・実差分・仕様・検証・レビューを照合する。非bot PRは状態ブロック必須。GitHubが認識するdependabot/github-actionsのBot投稿は例外とし、processテストとドキュメントチェックは実行する。既存PRもこのworkflowが走る時点で状態ブロックが必要になる。CIを必須チェックへ登録するbranch protection設定は別途管理者の操作が必要であり、このPRでは権限設定を変更しない。

```bash
node scripts/loop-runner.mjs --aftercare 123 --handled /tmp/handled.txt
node scripts/loop-runner.mjs --event ready --handled /tmp/handled.txt
node scripts/loop-runner.mjs --sync-pr 123
```

aftercareおよびDONEへの遷移直前はGitHubを再取得し、最新HEAD/base、CI全体、必須チェック、approval、mergeability、ページ取得完了、未処理指摘0件を確認する。E2E必須ならpublic/authenticated両方の成功を要求する。handledは `scripts/collect-pr-findings.mjs` の `<finding id> <updatedAt>` 形式。本文が切れている候補は全文を読んで判定する。収集コマンドのPASSだけではaftercareを完了できない。

別worktreeから再開する場合は対象branch/HEADをcheckoutし、`--restore-pr <番号>` で復元する。復元先に既存タスクがある場合や別branchの状態は拒否する。PR本文のsnapshotが古い場合は過去のRisk・finding・counterを保持し、検証を失効してEXECUTEへ戻す。復元前にcurrent PR HEAD/baseをfetchしてcheckoutする。PR本文への同期でチェックが再実行された場合はその完了を確認する。DONEはmerge_readyを表し、merge自体はユーザーの許可に従う。
