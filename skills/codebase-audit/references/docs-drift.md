# docs-drift の観点

文書（`docs/`・`README.md`・`AGENTS.md`・`skills/`）と、今のコードのずれを探す。

## 探すもの

- **存在しないものへの言及。** 文書に書かれたファイルパス・関数名・コンポーネント名・コマンド（`package.json` の scripts）が、今も存在するか。ディレクトリ構成の説明（`docs/technical-design.md` など）が今の構成と合っているか。
- **挙動の説明のずれ。** 画面の仕様（`docs/ui-ux-design.md`）、認可（`docs/auth-guard.md`）、CI と E2E の動き（`docs/development-process.md`）の説明が、今の実装と合っているか。
- **環境変数。** コードで読んでいる環境変数と `docs/environment-variables.md` の一覧が一致しているか（使われていないもの・書かれていないもの）。
- **正本の重複。** 同じ手順や規則が複数の文書に書かれていないか。`docs/development-process.md` の冒頭にある正本の一覧（専門手順は `skills/`、契約は `AGENTS.md`）と食い違っていないか。
- **Agent 向けの文書。** `AGENTS.md` の Capability skills の表の条件が今のパスと合っているか。skill の中の手順・パス・コマンドが今も正しいか（`skills/skills.test.mjs` が見るのは skill の参照の実在までで、中身の正しさは見ない）。

## 出すときの注意

- 文書を検査するテスト（`tests/workflow/*.test.ts` など）がある記述は、文書だけ直すとテストが落ちる。指摘に、関係するテストを書く。
- 経緯の説明として残している古い名前（例: 「#181 で ReceiptForm から置き換えた」）は、ずれとして扱わない。
