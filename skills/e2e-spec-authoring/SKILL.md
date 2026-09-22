---
name: e2e-spec-authoring
description: E2E specの追加・修正でseed・cleanup・project選択が必要なときに使う。
license: Apache-2.0
---

# E2E specを書く

## 原則

- 再現性が必要なデータは `e2e/helpers/seed.ts` の専用helper経由で作る（例: `seedTaxReviewDraftByUser`、`seedMixedTaxReviewDraftByUser`、`seedUnallocatedTaxDraftByUser`、`seedPendingGroupInvitationForUser`、`seedGroupMemberForUser`）。手動でlocal DBへ共通seedを流さない
- seed HTTP routeは `APP_ENV=development`・cleanup secret・固定E2Eユーザー/所属groupで保護されている
- まっさらなlocal DBでは先に認証済みページを1回表示してユーザーとgroupを作成し、その後seedしてreloadする
- specが作ったデータはcleanup helper（`e2e/helpers/cleanup.ts`）で後始末し、spec間で状態を共有しない
- Issue固有の状態は必要最小限のfixtureにする
- projectは認証済みchromiumとpublicを使い分ける。`--grep @smoke` でsmoke、`--grep @public` で公開面を選択できる
- レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock`（OpenAI APIは呼ばない）
- browser層の受入条件がある変更だけ対象specをlocal実行する。`src/**`・`e2e/**` のpathだけを理由にローカル全E2Eは要求しない
- PR上のE2E要否は `scripts/classify-e2e-relevance.mjs` が機械判定するので、手動でskip判断しない

実行手順は `skills/local-dev-env`、詳細は `docs/development-process.md` §6。
