# Agent Harness操作手順

現行CLIの起動用クイックリファレンス。起動時に読むのはこのファイルだけでよい。詳細仕様（証跡の再利用条件・metrics・CI扱い・監視の中断条件など）は [Agent Harness詳細仕様](agent-harness-reference.md) にあり、必要になった節だけを読む。軽量化の設計正本は [Agent Harness設計](agent-harness-design.md)。

## 手順

runnerの通常出力は `state`・`workflow`（現在Stateのworkflow）・`missing`・`next` を返すので、`workflow` を読み `next` を実行する。taskId・head/base・risk・verification・openFindings・aftercare も含まれ、spec・history・評価本文・ログ本文は含まれない。根拠は `--explain`、証跡manifestは `--artifacts`、状態スナップショットは `--status`、状態ブロックは `--export` / `--export-file` / `--sync-pr` のみ。

1. 専用worktreeで `node scripts/check-task-worktree.mjs --require-clean`。
2. `--draft spec [--issue <番号>]` でspec下書きを作り、TODOを埋めて `--init <spec.json> --task <id> --runtime codex|devin|claude-code --implementer <session>`。PR作成を許可するならspecに `"prAllowed": true` を入れる（未指定/falseならEXECUTE末尾で `needs:"pr_permission"` に止まる）。
3. REFINE: `--draft assessment` → TODOを埋めて `--assessment <file>` → `--next`（spec/assessment/TODOを機械検証してreadyへ。不足は `needs` に出る）。Machine由来の初期値（data_security・reversibility・applied_tier）は下げられない。
4. EXECUTE: 実装・commit → `--next`（clean tree → `verify:prepush`（marker無しのとき実行）→ 未解決ciFailureの再確認 → 残りの必須検証 → ready → `prAllowed===true`なら push＋draft PR作成 → REVIEWへ）。prepush失敗・dirty tree・再現しないCI失敗では `needs` に止まる。
5. REVIEW: `--next`（external findings収集＋packet生成、`needs:"review"` と独立レビュー要否を返す）→ reviewerへpacketを渡す → `--next --review <file>`（REVIEW cleanに必要な残り検証→レビュー記録→open finding 0ならclean、あればfindings遷移でreasonはfinding id一覧）。再レビューは条件を満たせばpacketが自動で増分になる。
6. AFTERCARE: `--next`（`--sync-pr` → `gh pr ready` → watch（ready待ち）→ ready遷移 → `--publish-metrics` まで機械実行。`action_required` / CI失敗は `needs:"ci_reproduce"` で止まり、再現コマンドを返す）。
7. 再開: 同じworktreeでは `--next`。別Sessionでは `--restore-pr <番号>`。
8. 計測: `--friction-note <text>`、`--record-usage <transcript.jsonl> [--usage-role reviewer]`、`node scripts/loop-metrics.mjs --task <id>`（`--format summary-json [--out <file>]` でPRコメントと同じ1レコードの要約。PRを作らないeval用途）。PR横断の集計は `node scripts/collect-harness-metrics.mjs --since <YYYY-MM-DD> [--state merged|all] [--format table]`。

`--next` は `{taskId, state, needs, steps, next}` の1個のJSONだけ返す。stepsには成功した機械stepの名前だけ入る。`needs` は次に人間/Agentが供給するもの: `spec|assessment|skills|decisions|implementation|commit|verify:prepush|ci_reproduce|ci_unexpected_skip|verify|pr_permission|review|reassessment|fix|aftercare|pr|action_required|ci_pending|resolution|approval|gate|metrics|usage`。`gate`/`metrics`/`usage` は機械stepが例外になった停止（`error` に末尾ログが入る）で、原因を直して `--next` を再実行する。`--next` が `decision_required`・`resolved`・human-gate-release・`ci_failure` イベントを発火することはない — 判断は常にAgent側で、個別コマンド（`--event findings --exit` 等）は [詳細仕様](agent-harness-reference.md) を参照。

提出JSONは `--draft <spec|assessment|review|exit>` で下書き（`<git-path>/agent-drafts/`）を作り、残った `TODO` だけ埋めて提出する。`TODO` が残っていると拒否され、該当するJSON Pointerが返る。必須キーは `requiredKeys(kind, context)`（`scripts/loop-schema.mjs`）がスキーマと検証関数から一元生成するので、下書きと検証はずれない。要点だけ列記する:

- spec: `predictedRisk` 必須、Human Requestは改変しない（`--draft spec --issue` が「やりたいこと」節を `humanRequest` へ入れる）
- assessment: `risk_assessment`（4軸）・`tier_rationale`。Machine由来の初期値より低い値は拒否される
- review: 独立レビューは `independent: true`・`context: "fresh"`、増分は `deltaFrom`。findingの `severity` は `blocker|major|minor|nit` で必須、`deferred` は minor|nit のみ
- exit: `--draft exit --event <event>` が該当eventの必須キー（`reason`・`approval`・`resolution`・`reassessment`・`reproduction`・`ciFailure`）だけ出力する

詳細は対応節だけ読む: [開始と再開](agent-harness-reference.md#開始と再開) / [実装と検証](agent-harness-reference.md#実装と検証) / [レビュー](agent-harness-reference.md#レビュー) / [PRとAFTERCARE](agent-harness-reference.md#prとaftercare)。

`AGENTS.md` はGit管理された実行契約であり、worktree作成時にGitが対象branchの版を展開する。作業先worktreeの版を参照し、同じSession内では同一内容をcanonical checkoutから重複して読み込まず、既読・未変更の内容も再読しない。checkoutや更新で契約内容が変わった場合は読み直す。
