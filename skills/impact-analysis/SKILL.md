---
name: impact-analysis
description: 直接のcaller・testだけでは変更の影響範囲を判断できないときに使う。
license: Apache-2.0
---

# 影響範囲を調べる

操作の詳細が必要な場合だけ[Loop README](../../.loop/README.md)を参照する。

## 入力・起動

direct caller/testだけでは影響を把握できない時に使う。

## 判断と出力

shared caller、認可、永続データ、外部操作、復旧範囲を調べ、具体的な要求とControlを契約へ追加する。Risk点数ではなく必要な確認と理由を残す。
