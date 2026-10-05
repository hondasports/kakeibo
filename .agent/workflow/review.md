# REVIEW

実差分・Acceptance Criteria・検証結果を独立に確認し、Risk Floorを含むレビュー深度を満たす。

## Risk

`Final Risk = max(Predicted Risk Floor, Machine Diff Floor, Agent Assessment, Reviewer Assessment)` とする。Machine Floorは引き下げ不可。

T1はセルフレビュー可。T2で `uncertainty=some_unknowns`、またはT3は独立Reviewer必須。独立Reviewerには実装担当の結論を先に見せず、目的・AC・差分・検証・関連caller/契約を渡して独立評価させる。材料は `node scripts/loop-runner.mjs --review-packet <dir>` で生成し、packet全体をfresh contextへ渡す。

## 検証との並行

REVIEW clean以降のゲートはcurrent HEADのfull unit証跡を要求する。packetを渡したら、Reviewerの作業と並行して `node scripts/loop-runner.mjs --verify-required` で残りのfull unitを完了させる。失敗した場合はfindingとして扱い、`findings` でEXECUTEへ戻す。

## Review loop

findingはid・状態・根拠を持ち、任意で重要度（`severity`: blocker | major | minor | nit）を持つ。Reviewerは各ラウンドで対象範囲を網羅し、見つけた指摘を重要度にかかわらず一度に出す。後のラウンドへ小出しにしない。重要度はcleanの条件を変えない。全findingの修正または根拠付き却下が必要である。修正後は変更hunk・影響項目・open findingを再確認する。共有契約や前提が変わった場合だけ範囲を広げる。

draft PRがある場合は、レビュー記録の前に `node scripts/collect-pr-findings.mjs --pr <番号>` で外部レビュー（CodeRabbit等）の未処理指摘を取得し、仕様と照合して同じラウンドのfindingsへ含める。内部・外部の指摘をEXECUTEで一度に修正し、clean後に外部指摘で全ループをやり直さないためである。外部レビューの完了を待つためにREVIEWで待機はしない。記録後に届いた外部指摘はAFTERCAREの収集で扱う。

同じラウンドのopen findingはEXECUTEでまとめて修正し、まとめて再検証する。1件ごとの修正→検証→再レビュー往復をしない。

レビュー記録は修正commitの前に行う。`--review` はclean treeを要求するため、finding修正を先にcommitすると記録対象のheadが失効する。記録→findings遷移→修正commitの順を守る。

## 再レビュー

`--review-packet <dir>` は、増分条件（同一base・全ACの証跡あり・現在HEADのancestor）を満たす最新のレビュー記録があれば、自動でそこからの増分資料を作る。満たさなければ全差分packetになる。起点の明示は `--delta-from <reviewed-head>`、全差分の強制は `--full-review` で行う。`diff.patch` は増分、`previous-review.json` は同じbaseの過去AC・finding記録、`full-diff.patch` は範囲拡張時の参照先となる。全AC・全変更path・過去finding・必須契約は引き続き提供する。review-template.jsonには過去findingのid・status・severityが事前記入されるが、evidenceはReviewerが再確認して書く。増分で影響を受けなかった閉じたfindingは、直前レビューの参照を根拠にしてよい。

Reviewerは増分・影響caller・open findingから確認し、影響のないACの証跡は過去レビューを参照する。全ACの `{id, evidence}` 記録は変わらず必須である。共有契約や前提が変わった場合は全差分へ広げる。報告全文はファイルに保存し、実装担当への返却は結論・指摘件数・対象HEAD・報告参照先を中心にする。

open findingが0件でfull unitを含む必須検証が揃っていれば `clean`。findingが残れば `findings`。3ラウンドごとに方針を再評価し、上限到達は未完了として扱う。
