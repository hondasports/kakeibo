---
name: line-integration
description: LINE連携（webhook・リッチメニュー・連携mode・画像処理）の変更・操作をするときに使う。
license: Apache-2.0
---

# LINE連携

## 構成

- webhook受付・署名検証・未連携応答・画像/サマリ返信: `convex/lineWebhook/`（`webhook.ts`、`actions.ts`、`summary.ts`、`image.ts`）
- LINEアカウント連携フロー: `convex/lineLink/`（`startLineLinkHandler`・`completeLineLinkHandler`）
- リッチメニュー適用: `pnpm run line:rich-menu`（既定はdry-run、`--apply`で実適用、`--image=`で画像指定。既定画像は `docs/line/rich-menu-readonly-summary.png`、画像生成は `scripts/generate-line-rich-menu-image.py`）
- 連携mode: Convex env `LINE_INTEGRATION_MODE`（mock / real）。`scripts/ensure-line-integration-mode.mjs` はunset・不正値のときだけmockを入れ、人間が設定した `real` をCIがmockで上書きしない

## 注意

- webhook署名・送信元検証・外部write境界の変更は `skills/security-review` を併用する
- LINE Developers console・チャネル設定等の外部操作は `skills/service-ops-safety` に従う
- channel secret・token等の秘密値をログ・PR・commitへ出さない
