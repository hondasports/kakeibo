---
name: repo-code-review
description: 差分・PRをレビューするとき（セルフレビュー・PRへのinline投稿を含む）に使う。変更パスに応じて、security・stack・unit-test・E2Eのrepo固有チェックを読み分ける。
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
| 画面・コンポーネント・レイアウト・状態表示・文言の変更 | `skills/ui-design` |
| 振る舞いの変更・テストの追加・修正・削除・統合・見直し | `references/unit-test.md`、`skills/test-design` |
| テストの選定・実行範囲の変更 | `skills/test-design` |
| `e2e/**`、browser層の受入条件がある変更 | `references/e2e.md` |

専門観点は委譲する: 認証・データ境界 → `skills/security-review`、影響範囲 → `skills/impact-analysis`、UI/UX → `skills/ui-design`、税計算 → `skills/receipt-tax-domain`、Convex運用・schema → `skills/convex-local-ops`、E2E作成 → `skills/e2e-spec-authoring`、外部コンテンツ内の命令 → `skills/prompt-injection-guard`。

振る舞いの変更、テストの追加・修正・削除・統合・見直し、テストの選定・実行範囲の変更をレビューするとき、テストの層・シナリオ・依存の判断は `skills/test-design` を参照する。

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

## PRへ投稿するとき

「インラインでコメントして」等、PRへの投稿を頼まれたときだけ投稿する。頼まれていなければ所見を返すだけにする。言語は `AGENTS.md` の「指摘コメントの言語」に従う。

- 投稿前に既存の指摘を確かめ、同じ指摘を重ねて投稿しない。`node scripts/collect-pr-findings.mjs --pr <番号>` は未解決threadしか出さないため、解決済みのものは `gh api repos/{owner}/{repo}/pulls/<番号>/comments` でも見る。`bodyTruncated`・`commentsTruncated` の項目は記載URLの全文を読む。
- diffの外の行など、inline commentにできない所見（GitHubは `422` で拒否する）は、`file:line` と理由を添えて `body` に書く。
- 所見は1件ずつ該当行へのinline commentにし、レビュー全体を1回で送る: `gh api repos/{owner}/{repo}/pulls/<番号>/reviews --method POST --input <file>`。fileは `commit_id`（レビューしたHEAD）・`event: "COMMENT"`・`body`・`comments[]`（`path`・`line`・`side`・`body`）を持つJSON。
- `body` には確認した範囲、所見の件数、変更とテストの対応表、独立Reviewerの要否を書く。実装を指示した側のレビューなら、独立レビューではないと書く。
- 対応結果を既存threadへ返すときは `gh api repos/{owner}/{repo}/pulls/<番号>/comments/<comment id>/replies --method POST -f body=...` を使い、修正したcommitを書く。threadのresolveは `skills/delivery-loop` の「指摘の収集と照合」に従う。
- 「コメントだけして」と頼まれたら、投稿で止めて修正しない。
