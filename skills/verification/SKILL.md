---
name: verification
description: 変更の検証方法を選び、実行結果を確認するときに使う。
license: Apache-2.0
---

# 証明する

## 入力・起動

受入条件と差分を読み、安いstatic、targeted test、必要なintegration/E2Eの順で実行する。

E2E要否はPRの差分判定と同じ基準を使い、`node scripts/suggest-skills.mjs` のruntime_relevant出力で確認する。長大な出力を避けるため、テスト実行は `pnpm test:agent` / `pnpm e2e:agent` のcompact出力を優先する。

## 判断と出力

チェックを追加したことと成功したことを区別する。テストが証明する期待結果を確認する。受入条件は全件照合し、検証した内容・未検証・残課題を報告に残す。仕様不足は依頼者へ確認し、検証不足は方法を追加する。原因が明らかな失敗は修正し、不明・反復時だけincidentを使う。localとCIの全量重複は理由がある場合のみ。環境設定はdocs/development-process.mdを参照する。
