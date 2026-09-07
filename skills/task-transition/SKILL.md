---
name: task-transition
description: 次タスクへ移るためのv13判断手順。
license: Apache-2.0
---

# 次タスクへ移る

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

別Issueや別branchへ移る時だけ使う。

## 判断と出力

前タスクの目的、結果、PR、必要な未解決事項だけ引き継ぐ。新しいtask IDと専用worktreeでinitする。前タスクの証拠や承認を流用しない。通常DONEの追加工程ではない。
