# 技術スタック確認点

## Convex

- Convex編集時の作法は `convex/_generated/ai/guidelines.md` を正本とする
- `.filter()` ではなく `withIndex` で絞り込んでいるか。必要なindexを `convex/schema.ts` に定義しているか
- 件数上限のない `.collect()` がないか。増え続けるデータは `paginate` や `take` を使う
- `convex/schema.ts` の変更は既存データと後方互換か。migrationが必要なら `skills/convex-local-ops` に従う
- scheduler・`convex/crons.ts` から呼ぶ処理は再実行しても冪等か
- actionから複数回 `ctx.runMutation` を呼ぶ場合、途中失敗で不整合にならないか（1つのmutationにまとめられないか）
- `convex/_generated/` を直接編集していないか

## React・MUI

- 色・余白・サイズは `src/theme.ts`・`src/designTokens.ts` を使い、直書きしていないか
- 既存の `src/features/*` の構成（コンポーネント・hook・テストの配置）に揃っているか
- UI方針は `docs/ui-ux-design.md` と一致しているか

## Clerk

- `@clerk/backend` はサーバー側だけで使っているか
- フロントの認証状態は既存の `@clerk/react` の使い方に揃っているか

## 入力検証・日付・金額

- フォームや外部入力の検証は valibot で、既存スキーマ（`src/features/receipt/validation/` 等）と揃っているか
- 日付はJST前提。`lib/domain/common/date.ts` の `JAPAN_TIME_ZONE` やヘルパーを使い、週・月の境界がずれないか
- 金額は円の整数で扱っているか。税計算・按分は `skills/receipt-tax-domain` に委譲する

## メール

- Resend・react-emailの変更は `lib/email/` のテンプレート定義と整合しているか

## lint・型

- lint・format・型検査はCIで見る。レビューでは `oxlint-disable`・`@ts-expect-error`・`as any` 等の抑止を理由なく追加していないかだけ確認する
