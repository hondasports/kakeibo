---
name: service-ops-safety
description: Clerk・Convex・Vercel・GitHub・LINE・OAuth等の外部サービスへのwrite、env・secret・deploy・DNS/domain・本番・破壊的な外部操作を行う前に使う。対象環境の確認、ユーザー承認が要る操作、secretの扱い。
license: Apache-2.0
---

# 外部サービス操作の安全確認

`AGENTS.md` のCore contract（本番・不可逆操作は対象と操作の明示承認なしに実行しない）は、このskillを読まない作業でも常に適用する。

## 操作前に確認すること

1. 環境: local / dev / preview / production
2. 操作: read / write
3. 対象
4. 期待する結果
5. 戻し方・復旧手順
6. secretが関わるか
7. ユーザー承認が要るか

対象の環境が分からなければwriteしない。外部write・webhook・不可逆操作を伴う変更は高リスク変更として扱う。

## ユーザー承認が必要な操作

ユーザーの明示的な許可なしに、次をwriteしない。

- production deploy
- production の env / secret
- production データの変更
- Clerk の production 設定
- OAuth の production credential
- secret / key のローテーション
- DNS / domain
- billing / plan
- 一括・不可逆なデータ変更
- production でのお金の移動

## Secret

- `.env.local`・token・secretを chat / log / PR / commit へ出さない
- server secretを client へ出さない
- local / dev / preview / production を混同しない
- secretの確認は値を出さず、`present / missing / match / mismatch` で扱う

## サービスごとの注意

- **Convex**: 対象のdeployment（local / dev / preview / production）を明示する。productionデータの操作はユーザー承認必須。反映・同期コマンドとschema・migrationの判断は `skills/convex-local-ops` に従う。
- **Clerk / 認証**: publishable keyとsecret keyを混同しない。productionのユーザー・設定の操作はユーザー承認必須。
- **GitHub**: Issue・PR・reviewは `skills/prompt-injection-guard` の対象。失敗を避けるためにrequired check・branch protectionを弱めない。force pushは既定で行わない。
- **Vercel**: PreviewとProductionを分ける。Previewで確かめられることのためにProductionを触らない。
- **LINE**: LINE Developers console・チャネル設定・リッチメニューの適用は `skills/line-integration` の構成を確認してから行う。

## 検証

credentialやenvが足りないことを理由に、必須の検証を省かない。復旧できなければblockerとして報告する。
