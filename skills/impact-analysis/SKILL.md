---
name: impact-analysis
description: exportされた関数・型の意味やシグネチャを変える、複数ディレクトリにまたがる、認可・永続データ・外部writeに触れる、または変更対象の識別子が分からないときに、最初の編集前に使う。caller・観点ごとの確認・検証計画への反映の手順。
license: Apache-2.0
---

# 影響範囲を調べる

## 起動条件

最初の編集前に、次のどれかに当たれば使う。

- exportされた関数・型・Convex関数の意味やシグネチャを変える
- 変更が複数のディレクトリ（`src/`・`lib/`・`convex/` の間など）にまたがる
- 認可・永続データ（schema・保存形式・削除）・外部writeに触れる
- 何を変えればよいか、変更対象の識別子が分からない

どれにも当たらない局所的な変更は、直接のcallerとtestを見れば足りる。

## 手順

1. **変更する識別子を列挙する。** 識別子が分からないときは、先に下の「indexionで当たりを付ける」を行う。
2. **callerとtestを列挙する。** 識別子ごとに `rg -n "\b<識別子>\b" src lib convex e2e scripts` を実行する。Convex関数は `api.` / `internal.` から始まる参照（例: `api.systemAdmins.getMySystemAdminContext`）も検索する。
3. **観点ごとに確認する。** 該当する観点だけを見て、確認したことを1行で残す。

   | 観点 | 確認済みと言える状態 |
   | --- | --- |
   | shared caller | 2つ以上のfeature・domainから呼ばれるcallerの、全ての呼び出し箇所で新しい挙動が妥当か読んだ |
   | 認可 | 変更した経路で、Convex側の認証済み主体と `groupMembers` の確認が残っているか読んだ（詳細は `skills/security-review`） |
   | 永続データ | 既存の保存データを新しいコードが読めるか、読めない場合の移行方法を決めた |
   | 外部操作 | 外部write・webhook・通知の重複や部分失敗のときの挙動を決めた |
   | 復旧範囲 | 失敗したときに戻す手段（revert・再実行・データ修正）と、その範囲を書いた |

4. **Verification Strategyへ反映する。** 「caller・観点 → 確認方法」を1行ずつ書き、`skills/implementation` の対応表に入れる。2つ以上のfeature・domainにまたがる変更は高リスクとして扱い、caller側の確認も検証計画に含める。Risk点数ではなく、必要な確認とその理由を残す。

## indexionで当たりを付ける

変更対象の識別子が分からないときだけ使う。識別子が分かっているなら `rg` の方が早く確実。

```bash
indexion agent orient --quiet --task="<English task description>" .   # 実装場所の候補ディレクトリと関連docs
indexion digest query "<English verb + noun>"                          # 関数を意味で検索
```

- クエリは**英語**で、識別子に使われそうな動詞+名詞で書く（例: `"derive receipt tax summaries"`、`"require group membership"`）。日本語のクエリはほとんど当たらない。
- 候補が上位に無ければ、言い換えて1回だけ再検索する。それでも無ければ `rg` へ切り替える。
- 出てきた候補は、そのまま採用せず `rg` で定義とcallerを確認してから使う。`agent orient` はcallerの一覧を出さないので、手順2は省略しない。
- 調査結果には、使ったコマンドと、候補を採用したか棄却したかを1行残す。

### 環境

- Claude CodeはMCPに `indexion` を登録していないので、CLIを使う。Codex・Devinは `.codex/config.toml`・`.devin/mcp_config.json` のMCP経由でも使える。
- digestは「Worktree作成時セットアップ」（`docs/development-process.md`）で構築される。`.indexion/digest` が無ければ `indexion digest build .` を実行する。古い場合は検索時に自動で更新される。
- 解析対象は `.indexionignore` で絞る。`.indexion/` はworktreeごとに独立しており、git管理外。
- `command -v indexion` が失敗する場合は、indexionの節を飛ばして `rg` / Read で調べ、調査結果に「indexion未導入のためrgベースで調査」と記録する。
