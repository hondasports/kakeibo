# E2E確認点

spec作成の手順は `skills/e2e-spec-authoring` を正本とする。ここではレビューで確認する点だけを挙げる。

## 受入条件との対応

- browser層の受入条件に対応するspecがあるか。無い場合は、ユニットテストで十分な理由が書かれているか
- 別グループからのアクセス拒否など認可の振る舞いは、`e2e/group-access.spec.ts` 系に追加が必要か判断したか

## spec-map

- 新しい `src/features/*` や `convex/*` 配下を追加したとき、`e2e/spec-map.json` に対応specを追記しているか。未登録だと `pnpm verify:prepush` が毎回 @smoke + @public 全件を選ぶ

## specの作法

- @smoke / @public のタグ付けが既存specの規約に揃っているか
- データは `e2e/helpers/seed.ts` のhelperで作り、`e2e/helpers/cleanup.ts` で後始末しているか。spec間で状態を共有していないか
- `waitForTimeout` 等の固定sleepを使わず、web-first assertionで待っているか
- レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock` 前提で、実OpenAI APIを呼んでいないか

## 実行範囲

- PR上のE2E要否は `scripts/classify-e2e-relevance.mjs` が判定する。手動でskipを判断していないか
