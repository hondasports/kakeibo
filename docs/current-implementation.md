# 現行実装スナップショット

このドキュメントは、Suzumemo（repository: `kakeibo`）の**現行コードから確認できる実装状態**をまとめる。

要件・設計ドキュメントには将来方針や互換性維持のための記述も含まれるため、実装済みかどうかを判断するときは本書とコードを参照する。コードと本書が食い違う場合はコードを正とし、変更したPRで本書も追随させる。

更新基準: `preview` branch のコード（2026-08-15確認）

## 1. 技術スタック

`package.json` で確認できる主要構成は次のとおり。

| 領域 | 現行実装 |
| --- | --- |
| フロントエンド | Vite + React + TypeScript |
| ルーティング | React Router |
| UI | MUI / MUI X Charts / MUI X Date Pickers |
| バックエンド・DB | Convex |
| 認証 | Clerk |
| 入力バリデーション | Valibot |
| メール | Resend + React Email |
| テスト | Vitest + Testing Library + Playwright |
| ホスティング | Vercel |
| Node.js toolchain | mise |
| package manager | pnpm |

開発時のNode.jsバージョンは `mise.toml`、Node.jsの互換条件は `package.json` の `engines`、pnpmのバージョンは `package.json` の `packageManager` を正とする。

## 2. フロントエンド構成

`src/features/` はFeature-based構成で、現行コードには次のfeatureが存在する。

- `account-deletion`
- `ai-expense-queue`
- `app-shell`
- `auth`
- `dashboard`
- `expense-entry`
- `expense-search`
- `group-admin`
- `monthly-summary`
- `receipt`
- `settings`
- `system-admin`
- `ui`
- `week`
- `weekly-summary`
- `yearly-summary`

特に、従来の週次中心の構成に加えて、**月次サマリー・年次サマリー・履歴検索**が実装済みである。

## 3. 現行ルーティング

`src/router.tsx` を正とする。主要ルートは次のとおり。

| パス | 画面・用途 | 備考 |
| --- | --- | --- |
| `/` | ダッシュボード | グループ認可配下 |
| `/weeks/current/input` | 支出・収入入力 | グループ認可配下 |
| `/weeks/:weekStartDate` | 週次サマリー | lazy load |
| `/months/:month` | 月次サマリー | lazy load |
| `/years/:year` | 年次サマリー | lazy load |
| `/search` | 履歴検索（支出・収入） | lazy load |
| `/settings` | 設定 | LINE連携・カテゴリ・週設定・グループ設定等 |
| `/settings/line/callback` | LINE Login callback | Web側連携完了導線 |
| `/settings/account/delete` | アカウント削除 | グループ認可配下 |
| `/settings/account/delete/status` | アカウント削除状況 | 認可ガード外の専用状態画面 |
| `/categories` | 設定 | `/settings` と同じ画面への互換ルート |
| `/guide` | 使い方 | グループ認可配下 |
| `/privacy` | プライバシーポリシー | 公開 |
| `/terms` | 利用規約 | 公開 |
| `/maintenance` | メンテナンス | 公開 |
| `/updates` | 更新履歴 | 公開 |
| `/group/setup` | グループ作成 | グループ未所属ユーザー向け |
| `/group/select` | グループ選択 | 複数所属ユーザー向け |
| `/group/invitations/accept` | グループ招待受諾 | Clerk invitation連携 |
| `/group/delete/status/:jobId` | グループ削除状況 | 非同期削除ジョブ |
| `/admin` | システム管理 | `SystemAdminRouteGuard` 配下 |

`/admin` 配下には、ユーザー検索・詳細、グループ検索・詳細、監査ログ、システム管理者管理、グループ削除復旧の画面がある。

### 3.1 グループルートガード

通常の家計機能は `GroupRouteGuard` 配下に置かれている。

- Clerk/Convex認証の確定を待つ。
- アカウント削除処理中の場合は `/settings/account/delete/status` へ送る。
- グループ未所属の場合は `/group/setup` へ送る。
- 複数所属等で表示対象が未選択の場合は `/group/select` へ送る。
- 条件を満たした場合だけ `AppLayout` 配下の家計機能を表示する。

## 4. 履歴・振り返り機能

### 4.1 週次サマリー

`/weeks/:weekStartDate` で週単位の支出・収入とカテゴリ別集計を確認する。既存の週次サマリー機能に加え、履歴ナビゲーションから月次サマリーと履歴検索へ移動できる。支出明細の一括カテゴリ変更・一括削除はグループ管理監査ログへ記録する。

### 4.2 月次サマリー

`/months/:month` で次を実装している。

- 月移動と当月への復帰
- 月間の支出・収入・収支
- カテゴリ別支出
- 月次支出カレンダー
- 日付選択による `?date=YYYY-MM-DD` の明細絞り込み
- 支出・収入一覧
- 支出・収入の編集と削除
- 対象年の年次サマリーへの導線

不正な月または未来月は現在月へ正規化する。

### 4.3 年次サマリー

`/years/:year` で次を実装している。

- 年移動と今年への復帰
- 年間の支出・収入・収支
- 月ごとの収支推移
- 収支の折れ線グラフ
- カテゴリ別の積み上げ面グラフ
- 年間のカテゴリ別支出
- 12か月の一覧から月次サマリーへ移動する導線

不正な年または未来年は現在年へ正規化する。

### 4.4 履歴検索

`/search` で支出・収入を横断して検索できる。現行フィルタは次のとおり。

- すべて・支出・収入の種別
- 店名・商品名・銀行名・メモ
- カテゴリ
- 金額の下限
- 金額の上限
- 期間プリセット（今週・今月・先月・直近3か月・今年）と任意の日付範囲

検索条件はURL queryとして保持する。結果は日付・IDのキーセットカーソルで100グループずつ追加取得できる。検索条件に連動して該当件数、支出・収入・差引、期間推移、カテゴリ別支出、前期間比較を表示する。
移行期間に旧`receipts`が残る場合は、同じ種別の新形式が存在しない月を旧形式で補完するため、検索範囲内に新旧データが混在しても旧月の履歴を欠落させない。

### 4.5 履歴ナビゲーション

`HistoryNavigation` は次の3画面を共通の「履歴」導線として扱う。

1. 週次サマリー
2. 月次サマリー
3. 履歴検索

年次サマリーは月次サマリー等から遷移する上位の振り返り画面として実装されている。

## 5. 家計データの正本

`convex/schema.ts` と現行の保存・集計コードを基準に、家計データは次のように整理する。

### 5.1 `expenseEntries`

**手入力・AI登録・集計の主導線における正本。**

主なフィールド:

- `groupId`
- `createdByUserId`（optional）
- `sourceDocumentId`（optional）
- `aiExpenseDraftId`（optional）
- `date`
- `amount`
- `categoryId`（支出で使用。収入では未設定）
- `title`
- `memo`（optional）
- `entryType`: `expense` / `income`
- `source`: `manual` / `ai_suggested` / `imported`

### 5.2 `sourceDocuments`

入力元を表すschema上の正本。

- `sourceType`: `manual` / `receipt` / `convenience_payment` / `invoice` / `unknown`
- `status`: `draft` / `ready` / `finalized`

現行コードではschemaは存在するが、一般利用向けの公開CRUDを中心導線にはしていない。

### 5.3 `receipts`

既存データとの互換層として残っている。新規の手入力・AI登録は `expenseEntries` を主導線とする。

集計コードは移行期間の二重計上を避けるため、`expenseEntries` と互換 `receipts` の扱いを統合している。詳細は `docs/technical-design.md` のM18節を参照する。

## 6. AIレシート入力

現行コードでは次の構成を持つ。

- `aiExpenseDrafts`
- `aiExpenseDraftItems`
- `receiptAnalysisBatches`
- `receiptAnalysisImageJobs`
- `receiptImageExtraction`

AI解析結果は直接確定登録せず、下書き・明細・解析ジョブとして管理し、ユーザー確認後に `expenseEntries` へ登録する。

画像本体は長期保存を前提とせず、同一ブラウザセッション内のプレビューを基本とする。OpenAIへの実送信は環境変数で制御し、通常のLocal / Preview / CIではmockを使う方針である。

## 7. 認証・グループ・システム管理

### 7.1 認証と所有境界

- 認証はClerkを使用する。
- Convex側では `ctx.auth.getUserIdentity()` から認証ユーザーを確認する。
- 家計データの所有境界は `groupId` と `groupMembers` を基準にする。
- `users.activeGroupId` が現在操作中のグループを表す。

### 7.2 グループ

ユーザーは複数グループに所属でき、ロールは `owner` / `member` を持つ。招待はClerk invitationとアプリ側 `groupInvitations` / `groupMembers` を組み合わせて管理する。

グループ削除は同期的な全件削除ではなく、`groupDeletionJobs` を使ったboundedな非同期ジョブとして実装されている。

### 7.3 システム管理者

システム管理者は `systemAdmins` を正本とし、グループ内の `owner` / `member` とは分離する。

`/admin` では管理情報を扱うが、システム管理者であること自体を家計データ横断アクセスの根拠にはしない。

## 8. LINE連携の現行実装

LINEはClerk認証を置き換えるログイン方式ではなく、認証済みWebユーザーへ紐づく外部チャネルとして扱う。

### 8.1 Web側アカウント連携

実装済み:

- `/settings` のLINE連携パネル
- `/settings/line/callback`
- OAuth 2.1相当の認可コードフロー
- PKCE (`S256`)
- state / nonce検証
- LINE ID tokenのaudience / issuer / expiry検証
- 連携解除

関連テーブル:

- `lineLinkRequests`
- `lineAccountLinks`
- `lineLinkAuditLogs`

### 8.2 Messaging API Webhook

`POST /webhooks/line` をConvex HTTP Actionとして実装している。

- raw bodyに対する `x-line-signature` のHMAC-SHA256検証
- 最大1MBのpayload制限
- JSON変換後の許可フィールドだけを内部イベントへ変換
- `webhookEventId` による冪等処理
- 未連携ユーザーへの案内返信
- 連携済みtextメッセージからの読み取り専用サマリー返信（今週の支出・収入・カテゴリ別・週別推移。未知テキストは使い方案内のみ。代表的な自然文はルールベースで既存intentへ正規化する）
- サマリー返信と使い方へのクイックリプライ（既存テキストコマンドと `APP_BASE_URL` の `/weeks/current/input`。未連携案内には家計操作を付けない）
- 連携済みimageメッセージの一時取得とAI支出下書き作成（Web確認必須。LINE側での登録・編集・削除はしない）
- Messaging API channel 向け default Rich Menu のセル定義（`lib/domain/lineSummary/richMenu.ts`）、設置用画像、および mock-safe な apply client（`convex/lineWebhook/richMenuClient.ts`）。実行時の自動適用はしない。人間が `pnpm run line:rich-menu -- --apply` で非Production channelへ設置する。セルは読み取り専用サマリーの message action のみで、レシート送信と Web 起動はクイックリプライ側に置く

関連テーブル:

- `lineWebhookEvents`
- `lineImageJobs`

LINEからの家計データ登録・更新・削除は「実装済み」とは扱わない。画像intakeの登録面は既存のWeb AI支出下書きキューである。

### 8.3 LINE環境変数

詳細は `docs/environment-variables.md` を正とする。主要変数は次のとおり。

- `LINE_INTEGRATION_MODE`
- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_LOGIN_REDIRECT_URI`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`

`mock` modeはProductionでは使用できない。

## 9. HTTPエンドポイント

`convex/http.ts` で常時登録される外部Webhook:

| Method | Path | 用途 |
| --- | --- | --- |
| POST | `/webhooks/resend` | Resend webhook |
| POST | `/webhooks/line` | LINE Messaging API webhook |

E2E専用HTTPエンドポイントはデプロイ時の環境変数に依存せず常時登録される。各handlerが `APP_ENV=development`、secret、固定E2Eユーザーを実行時に検証し、それ以外ではfail-closedする。詳細は `docs/environment-variables.md` を参照する。

## 10. 現行コードで未実装・将来扱いの主な項目

コード確認時点で、次は実装済み機能として扱わない。

- `/export` 画面
- CSV生成・ダウンロードUI
- 月収入設定UI（schema互換の `monthlyIncome` は残る）
- `sourceDocuments` を中心にした一般利用向け公開CRUDフロー
- LINEからの支出・収入登録、更新、削除
- オフラインファースト/PWAの完成フロー

## 11. 開発・検証コマンド

`package.json` のscriptsを正とする。代表的な検証は次のとおり。

```bash
pnpm test --run
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run e2e:smoke -- --project=chromium
pnpm run e2e -- --project=chromium
pnpm run e2e:public -- --project=chromium
pnpm run test:email-integration
```

E2Eは `scripts/sync-e2e-env.mjs` を経由して `.env.local` を同期する。worktreeを使う場合もE2Eを省略理由で通過させず、必要な環境同期を行ってから実行する。詳細は `docs/development-process.md` を参照する。

## 12. ドキュメント同期ルール

次の変更を行うPRでは、本書の更新要否を確認する。

- `src/router.tsx` のルート追加・削除・責務変更
- `src/features/` のfeature追加・削除
- `convex/schema.ts` の主要データモデル変更
- 家計データの正本変更
- 認証・グループ認可境界の変更
- `/admin` の権限・機能境界変更
- LINE / Resend / OpenAI等の外部サービス境界変更
- 現在「未実装」と記載している機能の実装

要件の背景・将来方針は `docs/requirements.md`、アーキテクチャの詳細は `docs/technical-design.md`、環境変数は `docs/environment-variables.md` を参照する。本書はそれらを置き換えるものではなく、**コードから確認できる現在地を明示するための索引兼スナップショット**である。
