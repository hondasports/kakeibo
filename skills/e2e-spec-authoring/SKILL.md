---
name: e2e-spec-authoring
description: E2E specを追加・修正するときに使う。対象パスは e2e/**。seed・cleanup・projectの選び方。
license: Apache-2.0
---

# E2E specを書く

E2Eを選ぶ判断は `skills/test-design` を正本とし、このskillはE2E specの作法と実行範囲を扱う。

## 原則

- 再現性が必要なデータは `e2e/helpers/seed.ts` の専用helper経由で作る（例: `seedTaxReviewDraftByUser`、`seedMixedTaxReviewDraftByUser`、`seedUnallocatedTaxDraftByUser`、`seedPendingGroupInvitationForUser`、`seedGroupMemberForUser`）。手動でlocal DBへ共通seedを流さない
- seed HTTP routeは `APP_ENV=development`・cleanup secret・固定E2Eユーザー/所属groupで保護されている
- まっさらなlocal DBでは先に認証済みページを1回表示してユーザーとgroupを作成し、その後seedしてreloadする
- specが作ったデータはcleanup helper（`e2e/helpers/cleanup.ts`）で後始末し、spec間で状態を共有しない
- Issue固有の状態は必要最小限のfixtureにする
- projectは `setup` と `chromium` を使い、`--grep @smoke` でsmoke、`--grep @public` で公開面を選択できる
- CIの選定条件は `docs/development-process.md` のFunctional E2Eとworkflowを正本とする。PRとpreview pushのlocal E2Eは `@public` / `@smoke` を選ぶため、タグがないテストはそこで実行されない。local pre-pushはspec単位で選ぶため、同じspecのタグなしテストも実行されうる
- レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock`（OpenAI APIは呼ばない）
- `skills/test-design` でE2Eが必要と判断した受入条件・不変条件について、対象specをlocal実行する。`src/**`・`e2e/**` のpathだけを理由にローカル全E2Eは要求しない
- PR上のE2E要否は `scripts/classify-e2e-relevance.mjs` が機械判定するので、手動でskip判断しない
- 広い主要導線を変えた場合だけ、必要に応じてlocal実行の範囲を広げる

実行手順は `skills/local-dev-env`、PR CIの差分判定の背景は `docs/development-process.md#pr-ci-e2eの差分判定` を参照する。
