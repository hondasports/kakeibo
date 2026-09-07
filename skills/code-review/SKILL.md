---
name: code-review
description: セルフレビューためのv13判断手順。
license: Apache-2.0
---

# セルフレビュー

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

元Issueの要求部分、契約、差分、最新の検証結果を読む。契約への書き落としがないか元要求と比較する。

## 判断と出力

要求の未実装・証拠不足・範囲外の挙動変更を先に探す。その後caller、拒否、失敗、永続化、必要な専門境界を確認する。指摘はstable IDでCLI findingへ。review JSONにsource_comparison/diff_assessment/verification_assessment/manual_results/verdictを記録しCLI reviewへ渡す。独立性を申告しない。内容変更後は再レビューする。

指摘はopen/resolved/not_applicableで管理する。修正と確認後にresolved、不成立なら根拠付きnot_applicable。必須検証不足やprotected findingを自己判断で受け入れる用途には使わず、未解決のまま明示する。
