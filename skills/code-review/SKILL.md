---
name: code-review
description: 実差分のリスクを評価し、CLIが指定する深度でセルフレビューするときに使う。
---

# コードレビュー

レビュー直前に `git diff <base>...HEAD` と未コミット・未追跡の内容、共有callerを確認する。`node scripts/task-loop.mjs guide assessment` の4軸・強制条件で実差分を評価し、根拠をassessment入力へ記録する。`assess` が返す深度の確認を実施する。深める必要があればassessのapplied_tierを指定し直す。

元要求と契約、差分の要求対応、検証の妥当性、manual結果をreviewへ記録する。評価とティアはCLIが付与するため転記しない。passは自己評価であり独立レビューではない。

指摘はstable idで管理し、修正確認か不成立の根拠で閉じる。再レビューでは前回指摘と新規差分が他項目へ与える影響も確認する。内容・契約・環境が変わったらcheck・assess・reviewを取り直す。
