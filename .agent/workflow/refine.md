# REFINE

雑なIssueを実装可能な仕様へ育てる。Human Requestは変更せず、Agent SpecをIssueへ追記・更新する。Issueのない依頼はtask specへ記録し、AFTERCAREでPR本文へ同期する状態ブロックとともに公開する（draft PRを先に作った場合もready化の前に同期する）。

## やること

1. repository、既存仕様、関連テスト、必要なら履歴を調査して現行挙動を確定する。
2. Goal / Acceptance Criteria / Non-goals / Assumptions / Verification Strategyを整理する。
3. 不明点を「調査で解決」「既存patternから安全に決定」「material decision」の3種に分ける。
4. Product / UX / Security / Data semanticsをmaterially変える未確定事項だけHUMAN_GATEへ送る。
5. SpecからPredicted Riskを評価する。Machine Floorを下げる目的で仕様を狭めない。
6. `--draft assessment` の下書きに残りの項目を記入し、`--assessment` で評価を記録する。Machine由来の初期値より低い値は拒否される。検証の強度はこの評価とTierから機械判定される（Profile機構は廃止）。

## Exit

`ready` は Goalがあり、Acceptance Criteriaが1件以上あり、material open decisionが0件で、各ACの検証方針を説明できる場合のみ返す。thorough検証（lint/unit/build必須）はTierと評価軸から機械判定される：final tierがT3、またはuncertaintyがknown_pattern以外、またはblast_radiusがshared_or_system_wideの場合。
