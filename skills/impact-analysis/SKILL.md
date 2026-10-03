---
name: impact-analysis
description: 直接のcaller・testだけでは変更の影響範囲を判断できないときに使う。
license: Apache-2.0
---

# 影響範囲を調べる

## 入力・起動

direct caller/testだけでは影響を把握できない時に使う。

## 判断と出力

shared caller、認可、永続データ、外部操作、復旧範囲を調べ、具体的な要求と確認条件を報告・Issueへ残す。Risk点数ではなく必要な確認と理由を残す。

- 調査結果はREFINEのassessment（`blast_radius`・`uncertainty`・`floor_triggers`）とVerification Strategyへ反映する
- shared caller・domain跨ぎの変更はfloor trigger語彙の `cross_domain_shared_caller_change` 相当として扱う（`scripts/machine-risk.mjs` のpath ruleにはなく、Agentがassessmentへ宣言する）
