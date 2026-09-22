# QA チェックリスト

このドキュメントは、kakeibo プロジェクト（UI ブランド名: Suzumemo）の品質確認手順をまとめたものです。

## 自動検証（CI）

CI チェックの詳細は `docs/development-process.md`「CI とマージ条件」を参照してください。

### ローカル確認コマンド

変更内容に応じて、次を選択して実行します。

```bash
pnpm test --run
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run e2e:smoke -- --project=chromium
pnpm run e2e -- --project=chromium
```

エージェント作業（`AGENTS.md` / `skills/*/SKILL.md`）でコード変更を含むPRを納品する場合は、PR作成前または差し戻し修正後に
ローカルで必要なE2Eを実行します。Issue 用 worktree では作成直後に `preview` 用 worktree の
正本 `.env.local` をコピーし、Convex 反映または E2E の直前には
`pnpm run e2e:env-sync` を実行して `.env.local` 同期、Convex `APP_ENV`・
`E2E_CLERK_USER_ID`・`E2E_CLEANUP_SECRET` 反映、
cleanup 認証確認まで成功させます。正本が無い場合は `docs/development-process.md` の bootstrap 手順で復旧します。

通常のローカル開発・ローカルE2Eは `pnpm run dev` でlocal ConvexとViteを起動します。
`e2e:env-sync` はlocal deploymentを選択した `.env.local` をcloud正本で上書きしません。
cloud dev deploymentへ同期する必要がある場合だけ、`pnpm run convex:dev:cloud` と
`pnpm run e2e:env-sync:cloud` を明示的に実行します。

環境変数不足、Convex CLI 認証不足、Clerk/Convex/Vercel の一時的な問題で必要なローカル E2E が
実行できない場合は、**その状態を理由として PR 作成や次フェーズへ進みません**。
不足や障害を解消して同期・Convex 反映・E2E を再実行し、成功してから納品を続行します。

### テストケース判断

- E2E・ユニットテストの追加要否は、要件、実装コード、既存テストを読んで判断します。
- 判断のためだけに `e2e-test-case.md` のような一時ファイルは作りません。
- 追加・変更したシナリオは、該当する `e2e/*.spec.ts` やコンポーネントテスト内のテスト名・コメントを正本として記録します。
- 細かい入力バリデーションや境界値はユニットテストを優先し、E2Eは主要導線、認証・権限、データ保存、重大な回帰リスクへ絞ります。

### 主要E2E観点

変更内容に応じて、次の導線から必要な範囲を選んで確認します。

- 支出入力（`ExpenseEntryForm`）: 日付、店舗名/支払先、金額、カテゴリ、メモを `expenseEntries` に保存できること。成功 Snackbar「支出項目を保存しました」
- 複数支出項目モード: 内訳合計と合計金額の差額確認ダイアログが機能すること
- 収入入力 UI: 支出・収入切替、カテゴリなし保存、未保存値保持、支出専用操作の非表示を確認
- 週次サマリー: 直近3週間の積み上げ棒グラフ、見切れない円・万円の軸ラベル、週合計・週範囲・カテゴリ凡例、内訳付きTooltip、空状態が表示されること
- 週次サマリーの支出一覧: 初期表示が5件で、残件数付きの全件展開、編集・削除、メモの展開・折りたたみが機能すること
- 週次サマリーの一括操作（`e2e/weekly-summary-bulk-ops.spec.ts`）: 明細選択、表示中のみ全選択、カテゴリのステージ付きプレビューと「変更する」、キャンセルで非反映、一括削除の件数確認と取り消し不可、週移動で選択解除
- 一括カテゴリ変更・一括削除の成功後、ownerの設定画面管理操作ログに件数が残ること。失敗時は監査行が増えないこと。金額・店名がログに出ないこと
- 週次サマリーのレスポンシブ: PCはグラフとカテゴリ内訳が2カラム、SPは1カラムかつ横スクロールなしで、編集・削除操作が44px以上あること
- 週次サマリー境界値: 直前2週間の支出がともに0円の場合、平均比が「比較データなし」と表示されること
- 設定: カテゴリ設定と週の開始曜日を保存できること（終了曜日は自動）
- グループ管理（`e2e/group-access.spec.ts`）: グループ作成、招待、切り替え、メンバー削除。グループ削除はownerの名称確認、status画面、開始直後のアクセス遮断、実engine完了後の選択/setup遷移を確認する。開始・失敗・完了通知の宛先とdedupeはConvex testで確認する
- 公開ページ（`e2e/public-pages.spec.ts`）: `/privacy`、`/terms` が認証なしで表示されること
- AI支出下書き（`e2e/ai-expense-queue.spec.ts`）: `ready` / `needs_review` の確認、編集、税警告表示、`registerReadyDraftsAsExpenseEntries` によるまとめて登録、セッション内サムネイル/拡大プレビュー、失敗時の固定ヒントと再撮影導線、複数画像を同一バッチとして扱う進捗表示、全件`ready`までの一括登録無効化、複数バッチの混在防止
- 認証（`e2e/auth.spec.ts`）: 未認証時のリダイレクト、ログイン後のダッシュボード表示
- ナビゲーション（`e2e/navigation.spec.ts`）: 主要画面間の遷移
- 設定（`e2e/settings.spec.ts`）: カテゴリ・週設定の保存
- レスポンシブ（`e2e/responsive.spec.ts`）: SP/PC 幅でのレイアウト崩れがないこと
- レシート画像抽出（`e2e/receipt-image-extraction.spec.ts`）: 画像解析フローの疎通
- ダッシュボード（`e2e/dashboard-home.spec.ts`）: ホーム画面の集計・導線
- レシートフォーム（`e2e/receipt-form.spec.ts`）: 手入力フォームの保存
- LINE画像intake（Convex test）: 連携済みimageの mock content 取得、未連携では取得しない、同意/グループ不足、fetch失敗、`needs_review` 下書き作成、自動登録しないこと。実LINE / 実OpenAI をCIで呼ばない。実LINE E2Eは必須にしない
- アカウント削除（`e2e/account-deletion.spec.ts`）: `/settings/account/delete` からの非同期削除リクエストと status 確認
- システム管理者（`e2e/system-admin-route.spec.ts`、`e2e/system-admin-search.spec.ts`、`e2e/system-admin-membership.spec.ts`）: `/admin` ルート制御、ユーザー・グループ検索、メンバー・権限操作
- 月収入関連 spec は #79 の UI 削除に伴い除去済み

## Clerk Restricted mode + Invitation 手動 QA

Clerk Dashboard で Restricted mode を有効にした状態での公開範囲検証です。

### 前提条件

- [ ] Clerk Dashboard > Settings > Restrictions で Restricted mode が ON であること
- [ ] 対象2名の invitation が発行済みであること

### QA-01: 未招待アカウントのサインアップ拒否

- [ ] 招待していない Google アカウントでアクセスする
- [ ] 「Googleでログイン」ボタンを押す
- [ ] Google認証後、アプリに戻れない（Clerk がブロックする）こと
- [ ] ブラウザのコンソールに意図しないエラーが出ていないこと

### QA-02: Invitation link からの登録

- [ ] 招待済みユーザー A に送った invitation link を開く
- [ ] Google アカウントでサインアップできること
- [ ] /sso-callback 経由で家計簿画面（/）にリダイレクトされること
- [ ] 招待済みユーザー B でも同様に確認できること

### QA-03: 登録済みユーザーの Google ログイン

- [ ] 登録済みユーザー A が「Googleでログイン」からログインできること
- [ ] Convex 認証が完了し、家計簿画面が表示されること
- [ ] 登録済みユーザー B でも同様に確認できること

### QA-04: 未認証状態での Convex 関数アクセス拒否

- [ ] ログインせずに Convex の保護対象 mutation/query を呼ぼうとする
- [ ] ConvexError("Not authenticated") が返ること
- [ ] フロントエンドでエラーが適切に表示されること

### QA-05: 他グループデータへのアクセス拒否

- [ ] ユーザー A でログインし、ユーザー B の所属グループの receipt / expenseEntry ID を直接指定する
- [ ] 取得・更新・削除が拒否されること（`groupId` が一致しない）
- [ ] 同様に category、weekSession でも拒否されること

### QA-06: ログアウト後の状態確認

- [ ] サインアウト後、/ にリダイレクトされること
- [ ] サインアウト後、保護対象ページにアクセスするとログイン画面が表示されること

## 品質基準

### Severity 定義

| レベル   | 内容                             | 対応方針             |
| -------- | -------------------------------- | -------------------- |
| Critical | 招待していない人がログインできる | リリースブロック     |
| Critical | 他グループのデータが見える       | リリースブロック     |
| High     | invited user が登録できない      | リリースブロック     |
| Medium   | ログアウト後の遷移が不正         | 修正してからリリース |
| Low      | UI 表示の軽微なずれ              | 次のPRで対応可       |

### 実行タイミング

- **公開前**: Restricted mode 有効化時
- **PR時**: Clerk設定に変更があった場合
- **定期確認**: 月1回程度の動作確認

## レポート方法

QA実施後は、以下の形式で結果を記録してください：

```
QA実施日: 2026-XX-XX
実施者: @username
対象環境: Production/Preview
結果: 全項目PASS / 1件FAIL (QA-XX)
詳細: FAILした項目の具体的な症状と対応方針
```
