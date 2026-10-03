# REVIEW

実差分・Acceptance Criteria・検証結果を独立に確認し、Risk Floorを含むレビュー深度を満たす。

## Risk

`Final Risk = max(Predicted Risk Floor, Machine Diff Floor, Agent Assessment, Reviewer Assessment)` とする。Machine Floorは引き下げ不可。

T1はセルフレビュー可。T2で `uncertainty=some_unknowns`、またはT3は独立Reviewer必須。独立Reviewerには実装担当の結論を先に見せず、目的・AC・差分・検証・関連caller/契約を渡して独立評価させる。材料は `node scripts/loop-runner.mjs --review-packet <dir>` で生成し、packet全体をfresh contextへ渡す。

## Review loop

findingはid・状態・根拠を持つ。修正後は変更hunk・影響項目・open findingを再確認する。共有契約や前提が変わった場合だけ範囲を広げる。

open findingが0件なら `clean`。findingが残れば `findings`。3ラウンドごとに方針を再評価し、上限到達は未完了として扱う。
