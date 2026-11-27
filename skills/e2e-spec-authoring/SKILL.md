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
- specが作ったデータはcleanup helper（`e2e/helpers/cleanup.ts`）で後始末し、spec間で状態を共有しない。操作の副作用で作られたデータ（登録で作られる `expenseEntries`、検索で記録される最近の検索等）も後始末に含める
- `locator.count()` は要素の出現を待たない。数えた件数でループ・判定する前に、web-first assertionで一覧の読み込みを待つ
- Issue固有の状態は必要最小限のfixtureにする
- projectは `setup` と `chromium` を使い、`--grep @smoke` でsmoke、`--grep @public` で公開面を選択できる
- specのテスト本体（`test(`）はすべてタグ必須（原則 `@smoke`。公開面は `@public`、staging固有は `@staging`）。CI の選定はタグ経由だけなので、タグなしのテスト本体はCIで実行されない。`e2e/global-setup.ts` は `chromium` が依存する `setup` projectとして別に実行される。CIの選定条件は `docs/development-process.md` のFunctional E2Eとworkflowを正本とする
- レシート抽出は `RECEIPT_IMAGE_EXTRACTOR_MODE=mock`（OpenAI APIは呼ばない）
- ローカル実行が要る場面は `docs/development-process.md` の「Verification」に従う（PRのマージ判定はCI）。追加・修正したspecは、CIの往復を減らすため `pnpm run e2e:isolated -- <spec>` で先に通しておいてよい。pathだけを理由にローカル全E2Eは要求しない
- PR上のE2E要否は `scripts/classify-e2e-relevance.mjs` が機械判定するので、手動でskip判断しない

実行手順は `skills/local-dev-env`、PR CIの差分判定の背景は `docs/development-process.md#pr-ci-e2eの差分判定` を参照する。

## レシート税のspec

税率判定・税配分のE2E seedや画面期待を作るときは、`skills/receipt-tax-domain` の「税率判定ルール」を正本にし、UIの表示文言とドメイン判定を混同しない。
