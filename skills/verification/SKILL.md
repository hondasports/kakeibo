---
name: verification
description: 変更の検証方法を選び、CLIで実行結果を記録するときに使う。
license: Apache-2.0
---

# 証明する

操作は `node scripts/task-loop.mjs status <task-id>` の案内を使う。詳細が必要な場合だけ[Loop README](../../.loop/README.md)を参照する。

## 入力・起動

契約のTCと差分を読み、安いstatic、targeted test、必要なintegration/E2Eの順でCLI checkを実行する。

## 判断と出力

チェックを追加したことと成功したことを区別する。テストが証明する期待結果を確認する。仕様不足は契約へ、検証不足はcheck/manualへ戻す。原因が明らかな失敗は修正し、不明・反復時だけincidentを使う。localとCIの全量重複は理由がある場合のみ。環境設定はdocs/development-process.mdを参照し、非秘密environment revisionを更新する。
