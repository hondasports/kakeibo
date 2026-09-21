---
name: convex-local-ops
description: Convexのlocal/cloud deployment選択、変更の反映、schema・migration変更を扱うときに使う。
license: Apache-2.0
---

# Convex操作

## 適用

- `convex/**` の関数・schemaを変更する
- local E2EやCI E2Eへ変更を反映する
- migration・deployment操作が必要

## 判断と出力

- `convex/**` を編集する前に `convex/_generated/ai/guidelines.md` を読む
- `pnpm run dev` のwatcherはlocal deploymentへ自動反映する。1回だけ反映したい場合はlocal環境同期後に `pnpm run convex:dev -- --once`
- GitHub Actions E2Eが使うcloud dev deploymentへの反映が必要な場合だけ `pnpm run convex:dev:cloud -- --once` を明示する
- schema・migration変更は `scripts/review-depth.mjs` の `schema_or_migration` floor trigger相当（T3）。データ削除・retention変更も同様に強制条件へ数える
- required environment不足、env sync失敗、Convex CLI未反映を「未実行理由」にして先へ進まない。復旧できなければblockerとして報告する
- 秘密値・deployment実値をログ・PR・Issueへ出さない

詳細は `docs/development-process.md` §7（Convex reflection）。
