# security の観点

確認点の正本は `skills/repo-code-review/references/security.md` と `skills/security-review`、認可の正本は `docs/auth-guard.md`・`docs/group-admin-permissions.md`・`docs/system-admin-authorization.md`。ここに観点を写さない。差分レビューとの違いは、**変更された箇所ではなく、全体を横断して漏れを探す**こと。

## 横断の仕方

- **Convex 関数の一覧を作って照らし合わせる。** 公開されている `query` / `mutation` / `action` / `httpAction` を列挙し、関数ごとに次を表にする。
  - 未認証を拒否しているか
  - 家計データなら `requireGroupMembership`（`convex/groups/membership.ts`）等でグループ所属を確かめているか。クライアント指定の `groupId` だけで認可していないか
  - システム管理者の操作なら `requireSystemAdmin`（`convex/systemAdmins.ts`）を通り、家計操作の認可と分かれているか。`convex/systemAdminSecurityMatrix.test.ts` に行があるか
  - サーバー内からだけ呼ぶものが `internal*` になっているか
  - `args` の validator が `v.any()` などで緩んでいないか
- **拒否のテストがあるか。** 上の表の各関数に、未認証・別グループ・権限なしで拒否されることを確かめるテストがあるかを書く（無いものは tests のテーマとも関係する）。
- **HTTP endpoint・webhook。** 署名や秘密の検証を、処理の前に必ず通っているか。E2E 用の endpoint が本番で fail-closed か。
- **secret と個人データの露出。** ログ・エラー文言・クライアントへの返り値・メール本文に、secret や私的なデータが出る経路がないか。
- **外部からの入力。** LLM の出力・画像・ユーザー入力が、検証を通ってから保存・表示されているか。

## 出すときの注意

- 漏れを見つけたら、実際に呼び出して拒否されないことまで確かめられれば「再現済み」、コードを読んだだけなら「確認済み」にする。
- 認可・グループ境界に触る指摘は、すべて「個別PR・独立レビューが要る」と印を付ける。
