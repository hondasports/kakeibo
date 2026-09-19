---
name: implementation
description: 契約に沿った変更と、実装中に判明した仕様変更を扱う。
license: Apache-2.0
---

# 変更する

操作は `node scripts/task-loop.mjs status <task-id>` の案内を使う。詳細が必要な場合だけ[Loop README](../../.loop/README.md)を参照する。

## 入力・起動

現在の契約、関連source、statusの不足条件を読む。実装前にworkspace-preflightを実施する。

## 判断と出力

要求に対応する最小差分を作る。未知callerや必要仕様を発見したら影響する契約だけ改訂する。仕様を満たすために必要なテストを追加し、実装を鏡写しにするだけのテストは作らない。新しい指示では無関係な成果を捨てない。変更によりCLIの証拠は保守的に失効する。
