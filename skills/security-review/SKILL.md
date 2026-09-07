---
name: security-review
description: セキュリティ観点を確認するためのv13判断手順。
license: Apache-2.0
---

# セキュリティ観点

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

次のいずれかを変更する場合にセルフレビューへ追加する。

- 認証・認可・所有権、tenant / group / user間のデータ境界
- 特権環境（privileged env）・secretの境界
- ユーザー入力、ユーザー制御のHTML・URL・redirect・file / path・MIME
- webhookの署名・送信元等の検証、外部write境界

## 判断と出力

未認証、権限なし、別user/group、server側の検証、入力の信頼境界、secret露出、webhookの検証、再実行と復旧を該当範囲で確認する。所見は共通findingsへ。専門観点の確認を独立レビューと呼ばない。
