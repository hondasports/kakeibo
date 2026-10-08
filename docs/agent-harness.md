# Agent Harness操作手順

現行CLIの起動用クイックリファレンス。起動時に読むのはこのファイルだけでよい。詳細仕様（証跡の再利用条件・metrics・CI扱い・監視の中断条件など）は [Agent Harness詳細仕様](agent-harness-reference.md) にあり、必要になった節だけを読む。軽量化の設計正本は [Agent Harness設計](agent-harness-design.md)。

## 手順

runnerの通常出力は `state`・`workflow`（現在Stateのworkflow）・`missing`・`next` を返すので、`workflow` を読み `next` を実行する。taskId・head/base・risk・verification・openFindings・aftercare も含まれ、spec・history・評価本文・ログ本文は含まれない。根拠は `--explain`、証跡manifestは `--artifacts`、状態スナップショットは `--status`、状態ブロックは `--export` / `--export-file` / `--sync-pr` のみ。

1. 専用worktreeで `node scripts/check-task-worktree.mjs --require-clean`。
2. spec JSONをリポジトリ外に作り、`node scripts/loop-runner.mjs --init <spec.json> --task <id> --runtime codex|devin|claude-code --implementer <session>`。
3. REFINE: `--assessment <file>` → `--event ready`（thorough検証はTierと評価軸から機械判定）。
4. EXECUTE: 実装・commit → `--verify-required`（unitは差分関連のaffected）→ `--event ready`。単独kindは `--verify <kind> [--scope affected]`。
5. REVIEW: 初回進入時はdraft PRを作り、`node scripts/collect-pr-findings.mjs --pr <番号>` の外部指摘を `--review-packet <dir> --external-findings <file>` でpacketへ含めて独立Reviewerへ渡す。full unit完了後に `--review <file>` → `--event clean | findings`（再レビューは条件を満たせば自動で増分）。
6. AFTERCARE: `--sync-pr <番号>` → `gh pr ready <番号>` → `--aftercare <番号> --watch-aftercare` → `--event ready`（DONE=merge_ready）→ `--publish-metrics <番号>`（metrics要約をPRのマーカー付きコメントへ保存。状態を更新しない）。状態や本文を更新しない観測は `--check-pr <番号>`。状態ブロックは `--export-file <path>` でファイルへ書き、`gh pr create --body-file` 等で本文へ結合する（Agentは状態ブロックをstdoutで読まない。`--export` は人が確認する用途）。
7. 再開: 同じworktreeでは引数なしで実行する。別Sessionでは `--restore-pr <番号>`。
8. 計測: `--friction-note <text>`、`--record-usage <transcript.jsonl> [--usage-role reviewer]`、`node scripts/loop-metrics.mjs --task <id>`（`--format summary-json [--out <file>]` でPRコメントと同じ1レコードの要約。PRを作らないeval用途）。PR横断の集計は `node scripts/collect-harness-metrics.mjs --since <YYYY-MM-DD> [--state merged|all] [--format table]`。

JSONの必須キー（schemaは `.agent/schema/` 配下）:

- spec: `spec.schema.json`。`predictedRisk` 必須、Human Requestは改変しない
- assessment: 形式の正本は `scripts/review-depth.mjs` の検証。`risk_assessment`（4軸）・`tier_rationale`・`applied_tier`
- review: `head`・`baseHead`・`reviewer`・`assessment`・`evidence`・`acceptanceCriteria`（全ACの `{id, evidence}`）・`findings`（`{id, status: open|fixed|dismissed, severity?, evidence}`）。独立レビューは `independent: true`・`context: "fresh"`、増分は `deltaFrom`
- exit（decision_required / findings / incident）: `reason` 必須。Human Gate解除には `approval: {"source":"user","reference":"..."}`

詳細は対応節だけ読む: [開始と再開](agent-harness-reference.md#開始と再開) / [実装と検証](agent-harness-reference.md#実装と検証) / [レビュー](agent-harness-reference.md#レビュー) / [PRとAFTERCARE](agent-harness-reference.md#prとaftercare)。

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。
