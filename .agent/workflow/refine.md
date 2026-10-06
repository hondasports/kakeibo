# REFINE

雑なIssueを実装可能な仕様へ育てる。Human Requestは変更せず、Agent SpecをIssueへ追記・更新する。Issueのない依頼はtask specへ記録し、AFTERCAREでPR本文へ同期する状態ブロックとともに公開する（draft PRを先に作った場合もready化の前に同期する）。

## やること

1. repository、既存仕様、関連テスト、必要なら履歴を調査して現行挙動を確定する。
2. Goal / Acceptance Criteria / Non-goals / Assumptions / Verification Strategyを整理する。
3. 不明点を「調査で解決」「既存patternから安全に決定」「material decision」の3種に分ける。
4. Product / UX / Security / Data semanticsをmaterially変える未確定事項だけHUMAN_GATEへ送る。
5. SpecからPredicted Riskを評価する。Machine Floorを下げる目的で仕様を狭めない。
6. `--assessment` で評価を記録する。JSONには `risk_assessment`（4軸）・`tier_rationale`・`applied_tier` と、Verification Strategyから根拠付きで評価した `verification_load: {level: routine|complex, rationale}` を含める。これがProfile自動判定の入力になる。

## Exit

`ready` は Goalがあり、Acceptance Criteriaが1件以上あり、material open decisionが0件で、各ACの検証方針を説明できる場合のみ返す。`ready` の遷移で記録済み評価からProfile（fast / standard / deep / max）を規則判定する。判定入力が欠ける場合はREFINEの不足条件として拒否される。`--profile` 指定済みのタスクは指定値を維持し、規則の評価結果は参照用に記録される。
