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
- schema・migration変更、データ削除・retention変更は高リスク変更として扱い、影響範囲と移行・復旧手順を確認してから進める
- required environment不足、env sync失敗、Convex CLI未反映を「未実行理由」にして先へ進まない。復旧できなければblockerとして報告する
- 秘密値・deployment実値をログ・PR・Issueへ出さない

例外ケースや背景だけ `docs/development-process.md#convex-reflection` を参照する。通常の操作は本ファイルで完結する。
