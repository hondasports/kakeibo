---
name: requirements
description: タスクの目的・受入条件・検証方法・完了地点を契約にするときに使う。
license: Apache-2.0
---

# 契約を固める

操作は `node scripts/task-loop.mjs status <task-id>` の案内を使う。詳細が必要な場合だけ[Loop README](../../.loop/README.md)を参照する。

## 入力・起動

元の依頼と関連source/testを調べ、goal/source/in_scope/out_of_scope/acceptance/preserve/controls/checks/environment/delivery_targetを定める。期待結果は外から観測できる形にする。

## 判断と出力

結果を左右する未解決事項はunresolvedへ。安く調査して解消し、残る選択だけ質問する。境界・拒否・失敗・永続化・caller・並行実行・UI状態を必要な範囲で考え、該当する要求と確認方法だけ残す。契約の入力検査はCLI contract。変更は理由を付けて更新する。
