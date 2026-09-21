---
name: code-review
description: 実差分のリスクを評価し、スクリプトが算出する深度でセルフレビューするときに使う。
---

# コードレビュー

レビュー直前に `git diff <base>...HEAD` と未コミット・未追跡の内容、共有callerを確認する。実差分を4軸（blast_radius / data_security / reversibility / uncertainty）と強制条件（floor_triggers）で評価し、根拠をtier_rationaleへ記録して `node scripts/review-depth.mjs` へ渡す。語彙は `--vocabulary` で確認できる。返された最低深度（T1/T2/T3）以上の確認を実施する。深める必要があればapplied_tierを指定し直す。

元要求、差分の要求対応、検証の妥当性、manual確認結果をレビュー結果としてPR・作業報告へ記録する。passは自己評価であり独立レビューではない。

指摘はidを付けて管理し、修正確認か不成立の根拠で閉じる。再レビューでは前回指摘と新規差分が他項目へ与える影響も確認する。内容・要求・環境が変わったら検証・評価・レビューを取り直す。
