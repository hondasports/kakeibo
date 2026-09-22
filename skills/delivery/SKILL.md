---
name: delivery
description: 検証済みの変更を許可されたbranch・PRへ公開するときに使う。
license: Apache-2.0
---

# 引き渡す

## 入力・起動

ユーザー指定の完了地点を確認する。許可されたbranch/PRへ必要差分だけ公開する。

## 判断と出力

publish前にstaged diffを確認し、タスク固有の作業ファイルや秘密値を含めない。PR本文は問題、結果、検証、制約を説明し、内部のGate一覧を転記しない。preview向けPRではテンプレートの更新履歴欄(suzumemo-updateブロック)に掲載方針(publish)と、掲載時はユーザー向け原稿、非掲載時は理由を必ず記入する。

PR本文・作業報告は、検証した内容・未検証・残finding・受入条件との照合結果を構造化して含める。PR上の指摘対応はまとめて1 pushで行い、pushごとのCI起動を抑える。

merge_ready相当を求められる場合はpr-aftercareへ進む。
