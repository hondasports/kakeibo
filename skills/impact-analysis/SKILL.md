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

## indexion による調査（導入環境では優先）

indexion が使える環境では、ファイル読み回しの前に次を使い、調査対象を絞る。

```bash
indexion digest build .                  # 初回のみ。関数インデックスを .indexion/digest に構築
indexion digest query "<目的>"           # 例: "レシート税計算" → 関数を意味で検索
indexion search "<クエリ>" [paths...]    # コード/ドキュメントの意味検索
indexion agent orient --task="<内容>" .  # 変更前ブリーフ（影響元・消費側・危険箇所）
indexion grep "<pattern>" [paths...]     # トークン構造検索（例: doc無し公開宣言）
```

- MCP経由でも同じツールが使える（`.devin/mcp_config.json` / `.codex/config.toml` に `indexion` サーバを登録済み）
- 解析対象は `.indexionignore` で絞る。生成物のローカル状態は `.indexion/` 配下に作られ、git管理対象外

## indexion が使えない環境でのフォールバック

`command -v indexion` が失敗する、または MCP サーバ起動に失敗する場合は、indexion 前提の手順をスキップし、従来通り rg / Grep / Read による探索で影響範囲を調べる。フォールバックした場合は調査結果に「indexion未導入のためrgベースで調査」と記録する。
