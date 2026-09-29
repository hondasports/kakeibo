# REFINE

雑なIssueを実装可能な仕様へ育てる。Human Requestは変更せず、Agent SpecをIssueへ追記・更新する。

## やること

1. repository、既存仕様、関連テスト、必要なら履歴を調査して現行挙動を確定する。
2. Goal / Acceptance Criteria / Non-goals / Assumptions / Verification Strategyを整理する。
3. 不明点を「調査で解決」「既存patternから安全に決定」「material decision」の3種に分ける。
4. Product / UX / Security / Data semanticsをmaterially変える未確定事項だけHUMAN_GATEへ送る。
5. SpecからPredicted Riskを評価する。Machine Floorを下げる目的で仕様を狭めない。

## Exit

`ready` は Goalがあり、Acceptance Criteriaが1件以上あり、material open decisionが0件で、各ACの検証方針を説明できる場合のみ返す。
