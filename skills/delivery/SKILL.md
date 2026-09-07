---
name: delivery
description: 引き渡すためのv13判断手順。
license: Apache-2.0
---

# 引き渡す

実行条件とCLI操作は[Loop README](../../.loop/README.md)を正本とする。

## 入力・起動

契約のdelivery_targetと最新statusを読む。許可されたbranch/PRへ必要差分だけ公開する。

## 判断と出力

publish前にCLI statusとstaged diffを確認し、タスク状態や秘密値を含めない。PR本文は問題、結果、検証、制約を説明し、内部のGate一覧を転記しない。pr_createdなら公開後finishで終了。merge_readyならpr-aftercareへ進む。
