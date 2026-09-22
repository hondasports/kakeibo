---
name: code-review
description: 実差分のリスクを評価し、スクリプトが算出する深度でセルフレビューし、指摘と修正を収束まで反復するときに使う。
license: Apache-2.0
---

# コードレビュー

## 深度判定

レビュー直前に `git diff <base>...HEAD` と未コミット・未追跡の内容、共有callerを確認する。実差分を4軸（blast_radius / data_security / reversibility / uncertainty）と強制条件（floor_triggers）で評価し、根拠をtier_rationaleへ記録して `node scripts/review-depth.mjs` へ渡す。語彙は `--vocabulary` で確認できる。返された最低深度（T1/T2/T3）以上の確認を実施する。深める必要があればapplied_tierを指定し直す。

## 反復プロトコル

レビューと修正はラウンドで管理する。

1. 算出ティアの確認項目でレビューし、指摘を finding としてid・状態・根拠つきで列挙する。
2. 各findingを修正するか、不成立・対象外の根拠で棄却する。無根拠で開いたままにしない。
3. 変更があれば影響範囲を限定して再レビューする。対象は変更hunk・修正が影響する項目・前回のopen findingsだけで、全差分を毎回見直さない。
4. open findingが0件（棄却含め全件に根拠あり）で収束。最大3ラウンドで打ち切り、残る未解決を報告する。

内容・要求・環境が変わったら検証・評価・レビューを取り直す。

## Checker

セルフレビューは自己評価であり独立レビューではない。Checkerは「セルフレビュー → CI → PR上のボット指摘（Devin Review等） → 人間承認」のチェーンとする。T3相当（認証・schema・データ削除等）では自己レビューの往復で収束を深追いせず、PR上のボット指摘と人間レビューに独立観点を委ねる。

## リモートの指摘

PR上のボット・人間の指摘も同じ型で扱う。`node scripts/collect-pr-findings.mjs --pr <番号>` で未解決スレッドを機械収集し、各件を修正 or 棄却（根拠）で閉じる。手読みの漏れを防ぐため「指摘なし」は機械収集で確認する。詳細は `skills/pr-aftercare`。

レビュー結果として、元要求、差分の要求対応、検証の妥当性、manual確認結果、残findingをPR・作業報告へ記録する。
