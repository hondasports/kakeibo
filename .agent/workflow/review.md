# REVIEW

実差分・Acceptance Criteria・検証結果を独立に確認し、Risk Floorを含むレビュー深度を満たす。

## Risk

`Final Risk = max(Predicted Risk Floor, Machine Diff Floor, Agent Assessment, Reviewer Assessment)` とする。Machine Floorは引き下げ不可。

T1はセルフレビュー可。T2で `uncertainty=some_unknowns`、またはT3は独立Reviewer必須。独立Reviewerには実装担当の結論を先に見せず、目的・AC・差分・検証・関連caller/契約を渡して独立評価させる。材料は `node scripts/loop-runner.mjs --review-packet <dir>` で生成し、packet全体をfresh contextへ渡す。

## 検証との並行

REVIEW clean以降のゲートはcurrent HEADのfull unit証跡を要求する（Lite lane除く：ローカル証跡はprocessのみで、判定はCIのcheckが正本）。`--next --review <file>` はレビュー記録の前に残りの必須検証を先に実行する。手動でReviewerと並行させる場合は `--verify-required` で残りのfull unitを先に完了させ、`--review` の記録はその終了を待ってから行う（状態を更新するrunnerは同時に1つ。別runnerが先に保存していると保存は拒否される）。失敗した場合はfindingとして扱い、`findings` でEXECUTEへ戻す。

## Review loop

findingはid・状態・根拠・重要度（`severity`）を持つ。severityの基準：blocker=ACを満たさない／セキュリティやデータの破壊／本番障害、major=誤った挙動・テスト欠落による回帰リスク・契約違反、minor=可読性・保守性・軽微な不整合、nit=書式・命名の好み。severityの記入は必須で、未記入はmajor扱いである。Reviewerは各ラウンドで対象範囲を網羅し、見つけた指摘を重要度にかかわらず一度に出す。後のラウンドへ小出しにしない。修正後は変更hunk・影響項目・open findingを再確認する。共有契約や前提が変わった場合だけ範囲を広げる。

cleanの条件は「blocker / majorのopen findingが0件」である。major以上は修正または根拠付き却下が必要で、deferredにはできない。minor / nitは修正・却下に加えて `status: deferred` と `followUp: <follow-up Issue URL>`（`gh issue create` でAgentが作る）を付けることで後回しにできる。deferredは機械的に検証され、URLが不正・severityがmajor以上・severity未指定なら拒否される。deferredした指摘は状態ブロックとPR本文に一覧として残る（追跡を消さない）。

draft PRがある場合は、packet生成前に `node scripts/collect-pr-findings.mjs --pr <番号>` で外部レビュー（CodeRabbit等）の未処理指摘をファイルへ保存し、`--review-packet <dir> --external-findings <file>` で独立Reviewerへ渡す（未信頼データとして包まれ、prompt-injection-guardが同梱される）。外部指摘の採否はReviewerが仕様と照合して判断し、同じラウンドのfindingsへ外部指摘を辿れるidで記録する。実装担当はReviewerの報告を編集しない。内部・外部の指摘をEXECUTEで一度に修正し、clean後に外部指摘で全ループをやり直さないためである。外部レビューの完了を待つためにREVIEWで待機はしない。packet生成後に届いた外部指摘は次のラウンドかAFTERCAREの収集で扱う。

同じラウンドのopen findingはEXECUTEでまとめて修正し、まとめて再検証する。1件ごとの修正→検証→再レビュー往復をしない。

レビュー記録は修正commitの前に行う。`--review` はclean treeを要求するため、finding修正を先にcommitすると記録対象のheadが失効する。記録→findings遷移→修正commitの順を守る。

## 再レビュー

`--review-packet <dir>` は、増分条件（同一base・全ACの証跡あり・現在HEADのancestor・同じspecのfingerprint・現在のrisk以上のtier・独立レビューが必要なら起点も独立レビュー）を満たす最新のレビュー記録があれば、自動でそこからの増分資料を作る。満たさなければ全差分packetになる。起点の明示は `--delta-from <reviewed-head>`、全差分の強制は `--full-review` で行う。`diff.patch` は増分、`previous-review.json` は同じbaseの過去AC・finding記録、`full-diff.patch` は範囲拡張時の参照先となる。全AC・全変更path・過去finding・必須契約は引き続き提供する。review-template.jsonには過去findingのid・status・severityが事前記入されるが、evidenceはReviewerが再確認して書く。増分で影響を受けなかった閉じたfindingは、直前レビューの参照を根拠にしてよい。

Reviewerは増分・影響caller・open findingから確認し、影響のないACの証跡は過去レビューを参照する。全ACの `{id, evidence}` 記録は変わらず必須である。共有契約や前提が変わった場合は全差分へ広げる。報告全文はファイルに保存し、実装担当への返却は結論・指摘件数・対象HEAD・報告参照先を中心にする。

## Exit

`node scripts/loop-runner.mjs --next` を実行する。PRがあれば外部レビュー指摘を収集し、`--review-packet` 相当のpacketを生成して `needs:"review"` で止まる（独立レビュー要否も返す）。Reviewerの報告ファイルを受け取ったら `node scripts/loop-runner.mjs --next --review <file>` を実行する: REVIEW cleanに必要な残り検証（Lite laneはprocess、それ以外はfull unit）を先に実行し、レビューを記録して、open findingが0件なら `clean` でAFTERCAREへ、残れば `findings` でEXECUTEへ遷移する（reasonはfinding id一覧が自動で入る）。2ラウンドごとの方針再評価が必要な回では `needs:"reassessment"` で止まるので、`--event findings --exit <file>` で根拠を記録する。

cleanの条件は「blocker / majorのopen findingが0件」でfull unitを含む必須検証が揃うこと（Lite laneは `lane: "lite"` のタスクでfull unit証跡を要求しない）。上限（5ラウンド）到達は未完了としてINCIDENTで扱う。

レビュー記録のJSONは `--draft review`（下書きの必須キーと過去findingの事前記入を含む）にReviewerの結果を記入する。`TODO` のまま残った項目は拒否される。
