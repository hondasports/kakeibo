---
name: risk-reconciliation
description: 指摘を処理するためのv13判断手順。
license: Apache-2.0
---

# 指摘を処理する

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

現在のfindingsと根拠を読む。重複recordを作らずstable IDを更新する。

## 判断と出力

修正と確認後はresolved、現行仕様で不成立なら根拠付きnot_applicable。未解決はopen。必須検証不足を閉じて迂回しない。本番・権限・データ保全等に関わる残存問題の受け入れは明示承認を必要とし、初版CLIにaccept機能がないためopenのまま扱う。
