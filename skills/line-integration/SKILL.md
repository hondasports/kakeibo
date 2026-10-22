---
name: line-integration
description: LINE連携（webhook・アカウント連携・サマリ返信・LINE通知・リッチメニュー・連携mode）を変更・操作するときに使う。対象パスは convex/line*/**・lib/**/line*/**、パスにLineLinkを含むファイル（設定画面・migration）、notifications配下でファイル名にline/Lineを含むもの、scripts/*line*。構成と注意点。
license: Apache-2.0
---

# LINE連携

## 構成

- webhook受付・署名検証・未連携応答・画像/サマリ返信: `convex/lineWebhook/`（`webhook.ts`、`actions.ts`、`summary.ts`、`image.ts`）
- サマリ返信の文面・quick reply・リッチメニューの定義: `lib/domain/lineSummary/`
- LINEアカウント連携フロー: `convex/lineLink/`（`startLineLinkHandler`・`completeLineLinkHandler`）。設定画面は `src/features/settings/components/LineLinkSettingsPanel.tsx`・`src/features/settings/pages/LineLinkCallbackPage.tsx`
- 退会済みユーザーに残った連携データを消す一回限りのmigration: `convex/orphanedLineLinkMigration.ts`
- LINE通知のpush送信: `lib/convex/notifications/linePushSender.ts`（連携modeに従う）、ジョブ処理は `lib/usecase/notifications/processLineJob.ts`・`lineJobLifecycle.ts`、Convex側の入口は `convex/notifications/lineActions.ts`
- リッチメニュー適用: `pnpm run line:rich-menu`（既定はdry-run、`--apply`で実適用、`--image=`で画像指定。既定画像は `docs/line/rich-menu-readonly-summary.png`、画像生成は `scripts/generate-line-rich-menu-image.py`）
- 連携mode: Convex env `LINE_INTEGRATION_MODE`（mock / real）。`scripts/ensure-line-integration-mode.mjs` はunset・不正値のときだけmockを入れ、人間が設定した `real` をCIがmockで上書きしない

## 注意

- webhook署名・送信元検証・外部write境界の変更は `skills/security-review` を併用する
- LINE Developers console・チャネル設定等の外部操作は `skills/service-ops-safety` に従う
- channel secret・token等の秘密値をログ・PR・commitへ出さない
