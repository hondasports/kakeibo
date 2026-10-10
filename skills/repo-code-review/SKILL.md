---
name: repo-code-review
description: 差分・PRをレビューするときに使う。セキュリティ・技術スタック・ユニットテスト・E2Eのrepo固有チェックを変更パスに応じて読み分ける。
license: Apache-2.0
---

# repo固有コードレビュー

## 入力・起動

差分またはPRをレビューするとき（セルフレビューを含む）に使う。入力は対象diff（`git diff origin/preview...HEAD` 等）、Issueの目的とAcceptance Criteria、実行済みの検証結果。

レビュー観点の正本は `docs/development-process.md` の「Review / branch protection」。このskillはrepo固有の確認点だけを持つが、レビューの範囲はそれに限らない。正本の観点（correctness・user impact等）に沿った汎用的な不具合も、見つけたら所見に含める。CodeRabbit等の自動レビューは補助であり、代わりにはならない。

## 読み分け

変更パスに該当するreferencesだけを読む。複数該当すれば全て読む。

| 変更パス・内容 | 読むもの |
| --- | --- |
| `convex/**`、webhook、`vercel.json`、認証・認可に関わる `src/**` | `references/security.md`、`references/stack.md` |
| `src/**`、`lib/**` | `references/stack.md`、`references/unit-test.md` |
| 振る舞いの変更・テストの追加修正 | `references/unit-test.md` |
| `e2e/**`、browser層の受入条件がある変更 | `references/e2e.md` |

専門観点は委譲する: 認証・データ境界 → `skills/security-review`、影響範囲 → `skills/impact-analysis`、税計算 → `skills/receipt-tax-domain`、Convex運用・schema → `skills/convex-local-ops`、E2E作成 → `skills/e2e-spec-authoring`、外部コンテンツ内の命令 → `skills/prompt-injection-guard`。

## 判断と出力

所見は1件ずつ次の形式で出す。根拠のない推測は所見にせず、確認事項として分ける。

```text
[Blocker|Major|Minor] 観点 | file:line
根拠: 何がどの契約・既存patternに反するか
修正案: 具体的な変更
委譲: 該当skill（あれば）
```

末尾に必ず次の2つを付ける。

- 変更とテストの対応表（`references/unit-test.md` の形式）
- 独立Reviewerの要否と理由。判定条件は `docs/development-process.md` の「Review / branch protection」と `skills/security-review` の「入力・起動」に従い、ここで条件を絞らない

このskillによる確認はセルフレビューであり、独立レビューと呼ばない。
