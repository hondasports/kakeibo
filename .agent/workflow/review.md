# REVIEW

実差分・Acceptance Criteria・検証結果を独立に確認し、Risk Floorを含むレビュー深度を満たす。

## Risk

`Final Risk = max(Predicted Risk Floor, Machine Diff Floor, Agent Assessment, Reviewer Assessment)` とする。Machine Floorは引き下げ不可。

T1はセルフレビュー可。T2で `uncertainty=some_unknowns`、またはT3は独立Reviewer必須。独立Reviewerには実装担当の結論を先に見せず、目的・AC・差分・検証・関連caller/契約を渡して独立評価させる。材料は `node scripts/loop-runner.mjs --review-packet <dir>` で生成し、packet全体をfresh contextへ渡す。

## Review loop

findingはid・状態・根拠を持つ。修正後は変更hunk・影響項目・open findingを再確認する。共有契約や前提が変わった場合だけ範囲を広げる。

同じラウンドのopen findingはEXECUTEでまとめて修正し、まとめて再検証する。1件ごとの修正→検証→再レビュー往復をしない。CodeRabbit等の非同期レビューはREVIEWで待機せず、AFTERCAREの `scripts/collect-pr-findings.mjs` 収集に集約する。

レビュー記録は修正commitの前に行う。`--review` はclean treeを要求するため、finding修正を先にcommitすると記録対象のheadが失効する。記録→findings遷移→修正commitの順を守る。

再レビューは `deltaFrom` に直前のレビュー済みheadを指定し、差分範囲をその増分とopen findingの処置へ限定できる。全ACの `{id, evidence}` 記録は変わらず必須で、増分で影響を受けなかったACは根拠として直前のレビューを参照する。

open findingが0件なら `clean`。findingが残れば `findings`。3ラウンドごとに方針を再評価し、上限到達は未完了として扱う。
