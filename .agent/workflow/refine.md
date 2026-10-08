# REFINE

雑なIssueを実装可能な仕様へ育てる。Human Requestは変更せず、Agent SpecをIssueへ追記・更新する。Issueのない依頼はtask specへ記録する。

## 判断

- repository・既存仕様・関連テスト・必要なら履歴を調査し、現行挙動を確定してから仕様を整理する。調査で解ける疑問をユーザーへ戻さない。
- 不明点は「調査で解決」「既存patternから安全に決定」「material decision」の3種に分け、Product / UX / Security / Data semanticsをmaterially変える未確定事項だけHUMAN_GATEへ送る。
- Machine Floorを下げる目的で仕様を狭めない。Predicted Riskは仕様全体で評価する。
- assessmentの初期値はMachine分類由来で、それより低い値は拒否される。

## Exit

`node scripts/loop-runner.mjs --next` を実行する。ready条件（Goal存在・AC≥1・open decision 0・各ACの検証方針）が揃わなければ `needs` で止まる。遷移・上限の正本一覧は `docs/agent-harness-states.md`、提出フォーマットの詳細は `docs/agent-harness.md` を参照する。
