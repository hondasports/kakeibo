---
name: security-review
description: セキュリティ観点ためのv13判断手順。
license: Apache-2.0
---

# セキュリティ観点

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

認証・認可・所有権・ユーザー入力・secret・外部write境界を変える場合にセルフレビューへ追加する。

## 判断と出力

未認証、権限なし、別user/group、server側の検証、入力の信頼境界、secret露出、webhookの検証、再実行と復旧を該当範囲で確認する。所見は共通findingsへ。専門観点の確認を独立レビューと呼ばない。
