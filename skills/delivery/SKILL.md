---
name: delivery
description: 検証済みの変更を許可されたbranch・PRへ公開するときに使う。
license: Apache-2.0
---

# 引き渡す

操作は `node scripts/task-loop.mjs status <task-id>` の案内を使う。詳細が必要な場合だけ[Loop README](../../.loop/README.md)を参照する。

## 入力・起動

契約のdelivery_targetと最新statusを読む。許可されたbranch/PRへ必要差分だけ公開する。

## 判断と出力

publish前にCLI statusとstaged diffを確認し、タスク状態や秘密値を含めない。PR本文は問題、結果、検証、制約を説明し、内部のGate一覧を転記しない。preview向けPRではテンプレートの更新履歴欄(suzumemo-updateブロック)に掲載方針(publish)と、掲載時はユーザー向け原稿、非掲載時は理由を必ず記入する。pr_createdなら公開後finishで終了。merge_readyならpr-aftercareへ進む。
