---
name: pr-update-spec
description: preview向けPRを作るとき、本文の更新履歴ブロック（suzumemo-update）を正しく記入するために使う。
license: Apache-2.0
---

# 更新履歴ブロック

base が `preview` のPRは本文に `<!-- suzumemo-update:start -->`〜`<!-- suzumemo-update:end -->` のyamlブロックが必須。`scripts/check-pr-product-update.ts` と `src/lib/productUpdateSpec.ts` がCIで検証し、欠落・不正はエラーになる。

- 掲載: `publish: true` + `category`（feature / improvement / fix / performance / stability のいずれか）+ `description`（ユーザー向け原稿。UI変更以外の修正・改善も掲載対象）。`reason` は記入できない
- 非掲載: `publish: false` + `reason`（非掲載理由）。`category` / `description` は記入できない
- `publish` は必須のboolean。`todo` / `tbd` / `fixme` / `placeholder` / `example` / `sample` 等のプレースホルダー文字列は拒否される
- 例外はマーカー自体を持たないbot作成PR（dependabot等）のみ。マーカーを記入したbot PRは人間のPRと同じく検証される
- baseが `preview` 以外のPRは対象外
