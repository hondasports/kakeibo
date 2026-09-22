# 軽く・サクッと記録できるWeb家計簿 技術設計

## 1. 設計方針

本MVPは、ClerkのGoogleアカウント認証でユーザーを識別し、Convexで家計データを保存・同期するWebアプリとして実装する。

目的は、ユーザーがPCやスマートフォンから同じ家計データへアクセスし、思いついた時に軽く・サクッと支出や収入を記録し、週単位の振り返りも軽快に行えることを検証することである。

Honoは初期構成には含めない。Convexはquery、mutation、action、HTTP actionを持つため、MVPの通常CRUD、同期、サーバー側処理の多くをConvex側で扱える。

## 2. 推奨技術スタック

| 領域               | 採用                                  | 理由                                                                                                      |
| ------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| フロントエンド     | Vite + React + TypeScript             | Convex Reactと相性がよく、SPAを軽く構築できるため                                                         |
| ルーティング       | React Router                          | 複数画面を明確に分けやすいため                                                                            |
| UIライブラリ       | MUI                                   | 利用実績が大きく、フォーム、テーブル、ダッシュボード系画面に強いため                                      |
| レイアウトCSS      | Tailwind CSS                          | 画面骨格、余白、レスポンシブ、表示切替を素早く実装するため。MUIコンポーネントの見た目制御には使いすぎない |
| 認証               | Clerk Google OAuth                    | Googleアカウントで素早く開始でき、Convex連携も用意されているため                                          |
| バックエンド/DB    | Convex                                | Reactから型安全にquery/mutationを呼べ、リアクティブ同期が標準で使えるため                                 |
| 入力バリデーション | Valibot                               | 軽量でTypeScriptとの相性がよく、ユーザー希望にも合うため                                                  |
| テスト             | Vitest + Testing Library + Playwright | ロジック、UI、主要フローを段階的に検証できるため                                                          |
| ホスティング       | Vercel                                | Vite SPAの配信、Preview/Production環境、MCP連携を単純に扱えるため                                         |

## 3. SupabaseではなくConvexを選ぶ理由

SupabaseはPostgres、SQL、RLS、分析、移行性が強い。一方で、このMVPでは複雑なSQL分析よりも、Reactからの軽快な同期、少ないバックエンド実装、型安全なquery/mutationの方が価値が高い。

Convexを選ぶ理由:

- Reactからquery/mutationを直接扱いやすい
- queryがリアクティブに更新され、複数端末同期の体験を作りやすい
- バックエンド関数をTypeScriptで書ける
- 通常CRUD、集計、CSV生成、将来の外部API連携をConvex内に集約しやすい
- MVP段階でAPIサーバー、ORM、SQL migration、RLS設計を減らせる

注意点:

- Postgres/SQLではないため、将来の高度な分析やSQL資産活用には向かない
- ベンダー依存はSupabaseより強くなりやすい
- 複雑なリレーショナル制約はアプリケーション側で設計する必要がある

## 4. Honoを使わない理由

HonoはCloudflare Workers上のAPIフレームワークとして優秀だが、Convex構成ではMVPに必須ではない。

Convexで担えること:

- 認証済みユーザーの確認
- DBの読み書き
- サーバー側のbusiness logic
- リアクティブなquery
- transactionとしてのmutation
- 外部API呼び出し用のaction
- webhookや独自HTTP endpoint用のHTTP action

Honoを追加すると、フロントエンド、Hono API、Convexの3層になり、MVPでは責務が増えすぎる。

### 4.1 Honoを後から検討する条件

- Convex以外の複数サービスをまとめるAPI Gatewayが必要
- Cloudflare Workers固有の機能を使いたい
- Workers KV、R2、Queues、Durable Objectsを中心にした処理が必要
- Convex外に置きたい公開APIが必要
- 既存のHono API資産と統合したい

## 5. アプリケーション構成

```text
src/
  App.tsx
  App.css
  main.tsx
  router.tsx
  theme.ts
  designTokens.ts              # MUI sx 用デザイントークン（feature 横断）
  designTokens.test.ts
  productionReleaseWorkflow.test.ts
  index.css
  utils/                       # feature 横断ユーティリティ（例: imageDataUrl）
  lib/                         # 横断ユーティリティ（例: weekComparison）
  routing/                     # E2E 専用ルート（e2eRoutes.tsx, e2eFixtures.ts）
  test/                        # テスト共通ユーティリティ
  features/                    # 機能単位（Feature-based）
    ai-expense-queue/
      components/
        queue/                 # QueueHeader, QueueSection, QueueItemCard, QueueContent 等
        review/                # ReviewDialog, ReviewItemCard, ReviewItemTaxDetails, ...
        AiExpenseQueuePanel.tsx
        BulkRegisterConfirmDialog.tsx
        ImageInputButton.tsx
        QueueEmptyState.tsx
        QueueHeader.tsx
        QueuePanelSlots.tsx
        ReviewReasonChips.tsx
        StatusChip.tsx
      context/                 # AiExpenseQueuePanelContext
      hooks/
        review/                # useReviewTaxOverrides, useReviewTaxSummaryOverrides, ...
        useAiExpenseQueuePanel.ts
        useAiExpenseQueueData.ts
        useQueueDelete.ts
        useBulkRegister.ts
        useImageUpload.ts
        useRetry.ts
        useReviewDialog.ts
      types/
      utils/                   # discountItems, taxWarnings, mappers, reviewValidation, ...
      index.ts
    app-shell/                 # レイアウト・公開・異常系ページ
      components/              # AppLayout, AppDrawer, AppBottomNav, UserMenu, ...
      lib/                     # publicPaths, navigationConfig, siteMetadata, maintenanceMode
      pages/
      index.ts
    auth/
      hooks/
      lib/                     # clerkError, convexError, clerkUserDisplayName
      index.ts
    dashboard/
      components/              # DashboardInputPanel, DashboardSummaryRow, WeekComparisonChart, ...
      hooks/
      pages/
      utils/
      index.ts
    expense-entry/
      components/              # ExpenseEntryForm, SingleEntryFields, MultiEntryFields, ...
      hooks/                   # useExpenseEntryForm, useExpenseEntryMode, useExpenseEntrySubmit, useInputPageWeek
      pages/
      types/
      validation/
      index.ts
    group-admin/
      components/              # GroupSettingsPanel, GroupMemberList, GroupInviteSection, GroupDangerZone, ...
      components/dangerZone/   # グループ削除・メンバー解除・権限譲渡の危険操作系
      hooks/                   # useGroupInviteManagement, useGroupRoleManagement, useGroupRenameManagement, ...
      lib/
      pages/
      utils/
      index.ts
    receipt/
      components/              # ReceiptForm, ReceiptImageExtractor 等
      hooks/                   # useReceiptForm, useReceiptImageExtraction
      validation/
      index.ts
    settings/
      components/              # CategorySettingsPanel, CategorySettingsList, WeekDaySettingsPanel, ...
      hooks/                   # useCategorySettings
      pages/
      index.ts
    ui/                        # 横断 UI（アニメーション等）
      components/              # SuzumemoLoadingState, AnimatedButton, PageTransition, CollapsibleHelp, ...
      index.ts
    week/                      # 週ナビ・日付ユーティリティ
      components/
      lib/
      index.ts
    weekly-summary/
      components/
      pages/
      types/
      utils/
      index.ts
    account-deletion/          # アカウント削除リクエスト・status UI
      pages/
      index.ts
    system-admin/                # `/admin` システム管理者 UI
      components/
      hooks/
      pages/
      types/
      index.ts

convex/
  auth.config.ts
  schema.ts
  http.ts                      # HTTP router（route 登録のみ）
  e2eHttp/                     # E2E 専用 httpAction ハンドラ
  lib/
    discountItems.ts
    weekDates.ts
  users/
    auth.ts
    mutations.ts
    queries.ts
    internal.ts
  groups/
    membership.ts
    mutations.ts
    queries.ts
    members.ts                 # addMemberByEmail, removeMember 等
    invitations.ts             # 薄い re-export ラッパー
    clerkInvitations.ts
    deletion.ts
    e2e.ts
    adminGuards.ts
    auditLogs.ts
    lib/                       # groupDeletion, managementAuditLog, groupName, groupQueryHelpers 等
    ...
  categories/
    queries.ts
    mutations.ts
    candidate.ts
    internal.ts
  receipts/
    crud.ts
    mutations.ts
    receipts.test.ts
    summaries.ts
    spendingEntries.ts         # lib/convex/receipts/spendingEntries.ts への re-export ラッパー
  expenseEntries/
    mutations.ts
    internal.ts
    expenseEntries.test.ts
  weekSessions/
    queries.ts
    mutations.ts
    internal.ts
  aiExpenseDrafts/
    queries.ts
    mutations.ts
    actions.ts
    model.ts
    internal.ts
    extractionMapping.ts
  receiptAnalysisJobs/
    queries.ts
    mutations.ts
    actions.ts
    internal.ts
  receiptImageExtraction/
    extraction.ts              # public action の薄いラッパー
  accountDeletion.ts          # セルフサービス退会リクエスト・ジョブ制御
  accountDeletionActions.ts   # 退会処理の Clerk 連携 action
  email/                      # トランザクションメール送信・抑制・webhook 処理
    actions.ts
    cleanup.ts
    internal.ts
    jobs.ts
    suppressions.ts
    model.ts
    lib/providers.ts
    webhooks/processResendEvent.ts
  crons.ts                    # 定期 cleanup ジョブ
  systemAdmins.ts             # システム管理者認可・管理 API
  systemAdminSearch.ts
  systemAdminMembership.ts
  systemAdminRoleOperations.ts
  systemAdminPendingInvitation.ts
  systemAdminPendingInvitationAction.ts
  systemAdminOwnerlessGroupRecovery.ts
  systemAdminGroupDeletion.ts
  legacyGroupDeletionAuditMigration.ts

lib/                           # Convex 外の純粋ヘルパー（api.d.ts 肥大化回避）
  convex/
    aiExpenseDrafts/           # reviewValidation, convex*Repository, convexDraftWorkflowServices, draftUsecaseDeps, handler グルー, persistTaxInterpretation, ...（v.* validator 宣言は convex/aiExpenseDrafts/validators.ts、E2Eフィクスチャは convex/aiExpenseDrafts/e2eDraftFixtures.ts へ移動）
    dateUtils.ts
    expenseEntries/            # createFromDraft, expenseEntryValidation
    groups/
      clerkInvitationLib/
      invitationHandlers/
    receiptImageExtraction/    # analyzeReceiptImageCore, openaiClient, parse, validators, ...
    receipts/                  # insert, queries, summaryLib, spendingEntries.ts
  domain/receipt/tax/          # interpretReceiptTax, normalizeTaxSummaries, resolveTaxContext, calculateTax, ...
```

フロントエンドは **Feature-based Architecture** を採用する。各 feature は `src/features/<feature-name>/`
配下に置き、feature 内は **type-based**（`components/`、`hooks/`、`pages/`、`types/`、`utils/`）で整理する。
画面ルートは各 feature の `pages/` に置き、`router.tsx` から feature の `index.ts` 経由で import する。
横断的な UI は `features/ui/`、週ナビ・日付は `features/week/`、アプリシェル・公開ページは
`features/app-shell/`、認証ユーティリティは `features/auth/lib/` に置く。バリデーションは
各 feature の `validation/` に置き、feature 外からは `index.ts` 経由で import する。

`theme.ts` と `designTokens.ts` は MUI theme / sx 用の横断定義として `src/` 直下に置く。
画像リサイズ等、複数 feature から使う純粋関数は `src/utils/` に置く（例: `imageDataUrl.ts`）。

### 5.1 feature 間の import 方針

- **エントリポイント**（`router.tsx`、`App.tsx`、`main.tsx`）から feature を参照するときは、必ず
  `features/<name>/index.ts`（barrel）経由にする。
- **feature 同士**の参照も barrel 経由とする（例: `import { WeekNavigator } from "../../week"`）。
  feature 内のファイルパス（`../../week/components/...`）への直接 import は避ける。
- **feature 内**では相対パス（`../components/`、`../hooks/` 等）を使う。
- **同一 feature 内**で barrel（`index.ts`）を経由して自分自身を import しない。
  共有 lib は `../lib/<module>` のように直接 import する（循環参照防止）。

現行の feature 間依存（例）:

| 依存元 | 依存先 | 用途 |
| --- | --- | --- |
| `app-shell` | `week`, `auth`, `ui` | レイアウト・ナビ・ユーザー表示 |
| `settings` | `group-admin` | グループ設定パネル |
| `receipt`, `expense-entry` | `ai-expense-queue`, `ui`, `week` | AI キュー UI・共通 UI・週選択 |

`CategoriesPage.tsx` は存在するが、現行ルーターでは `/categories` も `SettingsPage` へ向ける。

### 5.2 Convex モジュール分割方針

- **公開 API**（`query` / `mutation` / `action` / `internal*`）は `convex/<domain>/` に置く。
- **純粋ヘルパー**（バリデーション、集計、外部 API 呼び出し本体、登録ロジック等）は `lib/convex/<domain>/` に置き、`convex/` から import する。
  `convex/` 配下の `.ts` は Convex が `api.d.ts` に載せるため、ヘルパーを増やしすぎると型推論が深くなりビルドが失敗しうる。
- **HTTP** は `convex/http.ts` が router のみを担当し、E2E 用 handler は `convex/e2eHttp/` に分離する。

### 5.3 ドメインレイヤー（DDD）

ドメイン駆動設計に基づき、フロントエンド・バックエンド双方で使える **純粋なドメインルール** は `lib/domain/<domain>/` に配置する。

- `lib/domain/<domain>/` には、値オブジェクト・ドメイン型・純粋バリデーション・ドメインサービスを置く。
- `convex/<domain>/lib/` は `lib/domain/<domain>/` を利用した **Convex アダプタ** と位置づけ、UI から直接 import しない。
- `src/features/<feature>/` はプレゼンテーション層とし、ドメインルールが必要な場合は `lib/domain/<domain>/` を経由して利用する。

例として `lib/domain/groups/groupName.ts` ではグループ名の最大長・trim・空文字/超過判定を行い、
`convex/groups/lib/groupName.ts` はそれを `ConvexError` でラップして利用する。
同様に `lib/domain/groups/role.ts` は `GroupRole` 型とロールラベル関数を提供し、
フロントエンド・バックエンドの重複を解消する。

#### 5.3.1 集約・リポジトリ・ユースケース（expenseEntries / receipts / aiExpenseDrafts / groups）

`expenseEntries` / `receipts` / 支出一括操作（spending bulk ops）と `aiExpenseDrafts`、
および `groups` では、
ミノ駆動流の「知識をドメインオブジェクトへ寄せる」方針で 4 層に分離している。

| 層 | 配置 | 役割 |
| --- | --- | --- |
| ドメイン | `lib/domain/<domain>/` | 集約 class（`ExpenseEntry`, `Receipt`, `SourceDocument`）、値検証、所有権・利用可否の判定、リポジトリのポート（interface）。Convex の generated 型に依存しない（ID は `string`） |
| ユースケース | `lib/usecase/<domain>/` | 1 操作 1 関数。ポート経由で永続化し、`ConvexError` への写像を担う |
| インフラ | `lib/convex/<domain>/` | ポートの Convex 実装（`*Repository` / `*Reader` / `*Logger`）と handler グルー（`requireGroupMembership` 解決 + 依存構築） |
| プレゼンテーション | `convex/<domain>/` | `mutation`/`query` 定義、引数バリデータ、handler の再公開 |

要点:

- エンティティは「構築時に不変条件を確定」する（`ExpenseEntry.createManualExpense` 等）。
  `fromPersisted` は永続化済みドキュメントの復元専用で再検証しない。
- 所有権（`belongsToGroup`）、更新 patch 構築（`buildUpdatePatch`）、
  一括操作可否（`isSpendingRecord` / `isExpenseRecord`）はエンティティの知識。
- カテゴリ利用可否（存在・所属・isActive・「現行値なら非活性も許容」）は
  `lib/domain/categories/usability.ts` に集約し、メッセージ選択は呼び出し側が行う。
- リポジトリは `findById`/`insert`/`patch`/`delete` の最小ポート。
  `lib/convex/*Repository.ts` が `Id<>` と `string` の写像を吸収する。
- 互換性のため `*Handler` のエクスポート名・`(ctx, args)` シグネチャ・
  エラーメッセージは維持する（既存テスト・aiExpenseDrafts 連携が依存）。
- `convex/receipts/mutations.ts` の `deleteReceiptsByUser`（E2E 用内部 API）は
  インデックス走査を伴うユーティリティであり、ドメイン層には移さない。

`aiExpenseDrafts` ではこれに加えて次のパターンを使う。

- **ワークフローサービス・ポート**（`lib/domain/aiExpenseDrafts/draftWorkflowServices.ts`）:
  税再解釈の永続化（`DraftTaxInterpretationService`）、ユーザー上書きスナップショット
  （`DraftOverrideSnapshotService`）、明細置換（`DraftItemReplaceService`）、
  支出エントリのリコンサイル（`DraftExpenseEntryReconcileService`）、
  receipt 登録（`DraftReceiptInsertService`）のように、複数テーブルにまたがる
  永続化オーケストレーションをドメインが定義する interface として宣言し、
  `lib/convex/aiExpenseDrafts/convexDraftWorkflowServices.ts` が既存の
  永続化関数（`persistDraftTaxInterpretation` 等）へ ctx を束縛して実装する。
- `AiExpenseDraft` 集約が所有権・状態遷移ガード（キュー/履歴からの編集可否、削除可否、
  リセット可否、税解釈前提）と登録モード解決を保持し、ユースケースは
  `toConvexError` でドメインの Error を既存メッセージの ConvexError へ写像する。
- QueryCtx は書き込み不可のため、リポジトリポートは `*ReadRepository`（find/list）と
  それを継承する書き込みポートに分離する。
- `convex/aiExpenseDrafts/internal.ts` や `e2eDraftFixtures` 系の internal/E2E 専用
  エンドポイントは層移行の対象外とする。

`groups` ではハイブリッド（集約 class ではなくフィールド型 + 純粋ドメイン関数 +
ドメインサービス・ポート）を使い、次の点を重視する。

- **共有認可カーネル**（`convex/groups/membership.ts`）: `requireGroupMembership` 等は
  categories・weekSessions・receiptAnalysisJobs・aiExpenseDrafts・lineWebhook など
  複数ドメインから呼ばれるため、関数名・シグネチャ・エラー文言を維持したまま内部を
  ポート（`GroupMembershipReadRepository` / `UserDirectoryRead`）経由化している。
- **ドメインサービス・ポート**（`lib/domain/groups/groupServices.ts`）: 監査ログ
  （`ManagementAuditLog`）、メールキュー投入（`GroupEmailQueue`）、招待クリーンアップ
  （`GroupInvitationCleanup`）、アカウント削除ガード（`GroupAccountDeletionGuard`）、
  最後の owner 保護（`GroupOwnerTransitionGuard`）を interface として宣言し、
  `lib/convex/groups/` のアダプタが既存実装（`convex/groups/lib/*`・`adminGuards`）へ
  委譲する。これにより既存の委譲経路（spy 検証を含む）が保持される。
- **クエリモック互換**: Convex クエリ読み出しは `convex/groups/lib/groupQueryHelpers.ts`
  の `readQueryDoc(s)` 経由に統一し、インメモリテストモックのフォールバック
  （`collect` → `take` → `unique`）を維持する。
- **削除オーケストレーション**（`convex/groups/lib/groupDeletion*.ts` 群）も
  4層へ移行済み。ステージ順序・遷移判定・リトライ計画・影響集計の純粋関数は
  `lib/domain/groupDeletion/`（`stages`・`jobTransitions`・`counts`・`impact`・
  `retry`）、オーケストレーションは `lib/usecase/groupDeletion/`（`startGroupDeletion`・
  `resumeGroupDeletion`・`processGroupDeletionBatch`・
  `processRecipientNotificationBatch`・`processGroupDeletionFailureNotification`・
  `recordBatchRetry`・`runPurgeStage`・`countGroupDeletionImpact`・
  `deleteAllGroupScopedData`）、テーブル横断の ctx.db/scheduler/storage アクセスは
  `lib/convex/groupDeletion/` のアダプタ（`GroupDeletionJobStore`・
  `GroupDeletionPurgeStore`・`GroupDeletionRecipientStore`・`GroupDeletionScheduler`）
  へ隔離した。`convex/groups/lib/groupDeletion*.ts` は export 名・シグネチャを
  維持した互換シムとなり、internal endpoint 名・ステージ順序・削除カウント・
  通知 dedupe キー・エラーメッセージは不変。
- `convex/groups/e2e.ts`（E2E 専用フィクスチャ）は層移行の対象外とするが、
  `deleteAllGroupScopedData` 内部はユースケースへ委譲済み。

`accountDeletion` も同じハイブリッド方針で 4 層へ移行済み。

- **既存純粋関数の維持**: `classification`・`confirmation`・`errorCategory`・
  `resume`・`retry`・`status` は既に `lib/domain/accountDeletion/` に存在するため
  そのまま利用し、Clerk 削除エラー分類（`clerkError`）を追加した。
- **ポート**: `AccountDeletionRequestStore`（Reader 分離）・
  `AccountDeletionGroupPurgeStore`・`AccountDeletionUserDataPurgeStore`・
  `AccountDeletionScheduler`、および汎用 `TransactionalEmailQueue`
  （`lib/domain/email/`）を定義。グループ側の既存ポート
  （`GroupMembershipRepository`・`GroupReadRepository`・`UserDirectory`・
  `GroupDeletionJobStore`・`GroupDeletionWorkflowService`・
  `GroupInvitationCleanupService`）を再利用し、bounded read（`limit` 引数）と
  ページネーション（`paginateByUser`）、ユーザー物理削除（`deleteById`）のみ拡張した。
- **ユースケース**（`lib/usecase/accountDeletion/`）: 分類・孤立 membership 回収・
  進行中ガードの共有 helper と、プレビュー/ステータス参照、退会リクエスト開始、
  リトライ、failed purge リセット、準備バッチ、purge 進捗確認、mark 系、
  finalize、完了リクエスト掃除を 1 操作 1 関数で提供する。
- **プレゼンテーション**: `convex/accountDeletion.ts` は endpoint 定義と
  `loadAccountDeletionClassification` / `deleteOrphanedGroupMemberships` /
  `assertAccountDeletionNotInProgress` の互換シムのみを持ち、
  ctx.db/ctx.scheduler の直接アクセスはゼロ。`convex/accountDeletionActions.ts` は
  `"use node"` の Clerk 連携 action として骨格を維持し、エラー分類のみ
  ドメイン関数へ置き換えた。
- **状態遷移・エラー文言・メール payload/dedupe キー・子ジョブ生成の冪等性は
  不変**。internal endpoint 名と戻り値も維持する。

`systemAdmin`（管理コンソール系）も同じハイブリッド方針で 4 層へ移行済み。

- **既存純粋関数の維持**: `environment`（APP_ENV 解決）・`groupDeletion`
  （エラーカテゴリ sanitize）・`membershipOperation`（操作 shape 検証）・
  `reason`（理由正規化）は既に `lib/domain/systemAdmin/` に存在するためそのまま
  利用し、検索クエリ正規化・SHA-256 ハッシュ・ページ件数検証を `searchQuery`、
  systemAdmins/auditLogs/notifications のレコード型とポート、および検索面の
  `SystemAdminSearchStore` を追加した。
- **ポート**: `SystemAdminStore`（Reader 分離）・`SystemAdminAuditLogStore`
  （Reader 分離・8 系統のインデックス選択はアダプタ側）・
  `SystemAdminNotificationStore`・`SystemAdminSearchStore`（検索インデックス・
  normalizeId・created_at ページネーションを隔離）。groups/accountDeletion 側の
  既存ポート（`UserDirectory`・`GroupReadRepository`・`GroupMembershipRepository`・
  `GroupInvitationRepository`・`GroupDeletionJobReader`・
  `GroupDeletionWorkflowService`・`AccountDeletionRequestReader`）を再利用し、
  `UserDirectoryRead.findByDocId`・`GroupUserRecord` の createdAt/updatedAt・
  `GroupDeletionJobReader.paginate` のみ拡張した。
- **ユースケース**（`lib/usecase/systemAdmin/`）: `requireSystemAdminActor` 認可
  ゲート、管理者コンテキスト/一覧/監査一覧、grant/revoke/bootstrap/recover、
  メンバーシップ 5 操作・ロール 2 操作・ownerless 復旧、検索 4 件
  （監査 insert つき）、pending 招待 3 件、削除ジョブ一覧/再開を提供する。
- **プレゼンテーション**: `convex/systemAdmin*.ts` は endpoint 定義と
  `requireSystemAdmin` 互換シムのみを持ち、ctx.db/ctx.scheduler の直接アクセスは
  ゼロ。`systemAdminPendingInvitationAction.ts` は `"use node"` の Clerk 連携
  action として据え置き。
- **監査フィールド・通知 dedupe キー（`auditId:recipientUserId` /
  `auditId:user:...` / `auditId:email:...`）・payloadJson・エラー文言・
  発生順序は不変**。

`lineWebhook`（LINE webhook 受信・案内/サマリ応答・画像処理・cleanup）も同じ
ハイブリッド方針で 4 層へ移行済み。

- **純粋関数**（`lib/domain/lineWebhook/`）: `payload`（payload 解析・
  `LineWebhookPayloadError`）・`signature`（HMAC-SHA256 署名検証）・
  `claimPlanning`（active link 一意性判定・イベント/ジョブ項目組み立て）・
  `reply`（skip 理由・完了ジョブの応答文写像と
  `LINE_UNLINKED_GUIDANCE_MESSAGE` の正本）。
- **ポート**: `LineWebhookEventStore`/`LineImageJobStore`（Reader 分離）・
  `LineAccountLinkReader`・`LineWebhookUserReader`（画像外部 API 同意）・
  `LineActiveGroupResolver`（groups membership カーネルへ委譲）・
  `LineSummaryDataReader`（receipts 側の既存 adapter 関数へ委譲）・
  `LineWebhookScheduler`（mutation 側予約）。action 側は ctx.runQuery/
  runMutation/scheduler を抽象化したランナーポート群（`actionRunner.ts`）を定義する。
- **ユースケース**（`lib/usecase/lineWebhook/`）: `claimEvents`（dedupe・
  delivery 分岐・原子予約）・`cleanupOldEvents`・`loadImageProcessingContext`・
  `buildSummaryReply`・画像ジョブ遷移（skipped/drafted/failed）・
  `sendUnlinkedGuide`・`sendSummaryReply`・`buildLinkedImageReply`/
  `processLinkedImage`（リトライ規則を含む）。
- **インフラ**（`lib/convex/lineWebhook/`）: 各ポートの Convex 実装、
  LINE Messaging API / Rich Menu クライアント（旧 `client.ts`/
  `richMenuClient.ts` の本体）、action ランナー、deps 組み立て。
- **プレゼンテーション**: `convex/lineWebhook/*.ts` は endpoint 宣言・
  validator・互換 export シムのみ。`webhook.ts` は HTTP 境界（raw body・
  署名・payload 解析・413/401/400/200 応答）を担当し、mutation 呼び出しは
  `webhookIngress` アダプタへ隔離。ctx.db/ctx.scheduler の直接アクセスは
  プレゼンテーション層に残らない。
- **冪等性・dedupe・画像ジョブ遷移・リトライ上限/遅延・cleanup 保持日数/
  バッチサイズ・エラー文言・HTTP ステータスは不変**。endpoint 名・args・
  returns も維持する。

`lineLink`（LINE Login OAuth/PKCE・連携状態・TTL cleanup）も同じ方針で 4 層へ
移行済み。

- **純粋関数**（`lib/domain/lineLink/`）: 公開 feedback 写像、integration mode
  判定、ID token claims 検証、request claim/finalize と link 競合の判定。
- **ポート**: `LineLinkRequestStore`・`LineAccountLinkStore`・
  `LineLinkAuditLogStore`、action 側の内部 mutation bridge、request expiry scheduler、
  LINE provider client。
- **ユースケース**（`lib/usecase/lineLink/`）: OAuth開始/完了、request作成・claim・
  finalize・失敗記録・期限削除、状態照会・解除、E2E cleanup。
- **インフラ**（`lib/convex/lineLink/`）: Convexストア、scheduler、action runner、
  LINE token/verify API client、依存組み立て。lineWebhook側のintegration mode参照も
  presentation経由ではなく、このinfra境界を共有する。
- **プレゼンテーション**: `convex/lineLink/*.ts` はendpoint宣言・validator・認証境界・
  互換exportのみを持つ。OAuth endpoint/parameter、10分TTL、PKCE/nonce検証、
  active link競合・revoke順序、監査ログ、公開feedback、args/returnsは不変とする。

`receiptAnalysisJobs`（複数画像解析batch・AI draft世代管理・レビュー通知）も4層へ
移行済み。

- **純粋関数**（`lib/domain/receiptAnalysisJobs/`）: retry/cancel許可、batch完了状態、
  terminal通知判定、cleanup上限。batch/jobレコード型とstore/scheduler/actionポートを持つ。
- **ユースケース**（`lib/usecase/receiptAnalysisJobs/`）: batch/job作成・一覧・retry・cancel、
  解析attemptの開始/確定、世代競合時のdraft整理、processedCount/final status、
  AIレビュー通知、ユーザー単位cleanup、画像解析オーケストレーション。
- **インフラ**（`lib/convex/receiptAnalysisJobs/`）: Convex store/scheduler、
  receiptImageExtraction・aiExpenseDrafts・emailへのaction runner、Doc/Record変換。
- **プレゼンテーション**: `convex/receiptAnalysisJobs/*.ts` はendpoint・validator・
  group認可・互換handlerへ薄化する。expectedDraftId/updatedAt CAS、stale draft削除、
  1時間後通知、一覧/cleanup上限、エラー文言、args/returnsは不変とする。

`email`（transactionalメールジョブ・Resend送信・webhook・suppression・cleanup）も
4層へ移行済み。

- **純粋関数**（`lib/domain/email/`）: 終端status判定、送信失敗plan（retryable・
  maxAttempts・delay表）、新規jobフィールド構築、webhook payload抽出・鮮度比較・
  対象event type判定、cleanup cutoff/batch規則、status/suppression解決。
  job/suppression/webhookEventレコード型とstore/scheduler/runner/senderポートを持つ。
- **ユースケース**（`lib/usecase/email/`）: enqueue（payload検証・正規化・
  businessDedupeKey冪等・0ms schedule）、processEmailJob（終端/抑制/payload/
  送信結果の分岐とretry再予約）、processResendEvent（svixId dedupe・event記録・
  鮮度比較・status更新・suppression upsert）、cleanup、suppression upsert、
  E2E用テストレコード削除。
- **インフラ**（`lib/convex/email/`）: 3テーブルのConvex storeとDoc/Record変換、
  scheduler、action/webhook向けrunQuery/runMutationブリッジ、Resend provider選択
  （APP_ENV/RESEND_API_KEY/RESEND_FROM_ADDRESS）、from解決、httpActionの
  event submitter、依存組み立て。
- **プレゼンテーション**: `convex/email/*.ts` はendpoint宣言・validator・
  HTTP境界（`svix-*`署名ヘッダ検証・status応答。`webhook-*`はフォールバック受理）・
  互換handlerのみ。endpoint名、args/returns、エラー文言、HTTP status、
  dedupe・retry間隔・30日保持・batch100・呼出順序は不変とする。

通知の宛先は caller が `users.email` から解決する。`users.email` はログイン時の
`upsertUser` が Clerk JWT の `email` claim から格納するため、Clerk JWT template
`convex` の `email` / `name` claim 設定が前提になる（詳細は
`docs/environment-variables.md` を参照）。email未保持ユーザーは enqueue 自体が
スキップされる。

`categories`（グループ共有カテゴリの CRUD・デフォルト seed・E2E cleanup）も
4層へ移行済み。既存の `lib/domain/categories/`（normalize・defaults・usability・
candidate・CategoryRepository port）を再利用し、endpoint 向けの完全形状と
ルールを追加した。

- **純粋関数**（`lib/domain/categories/`）: seed patch 判定（legacy色refresh・
  description補完）、上限検証、sortOrder 決定（max+1）、所有権検証、E2E prefix
  検証。完全形状の `CategoryStoreRecord` と `CategoryStore` ポートを持つ。
- **ユースケース**（`lib/usecase/categories/`）: seed（sortOrder 既存なら
  patch 判定・無ければ insert）、create（normalize・上限・sortOrder）、
  update/deactivate（ownership・patch・get返却）、listActive/listForSettings、
  E2E cleanup（prefix一致削除・ensure）。
- **インフラ**（`lib/convex/categories/`）: `CategoryStore` の Convex 実装
  （`createCategoryStore`）と query 用読み取り専用 `createCategoryReader`、
  Doc/Record 変換。既存 `createCategoryRepository`（usability 用最小ポート）は
  無変更で維持する。
- **プレゼンテーション**: `convex/categories/*.ts` は endpoint・validator・
  group認可・互換export（`*Handler`・`E2E_CATEGORY_NAME_PREFIX`・定数再export・
  `./normalize` ラッパ）のみ。endpoint名、args/returns、エラー文言、seed 分岐、
  上限判定、E2E挙動は不変とする。

`users`（Clerk認証由来のプロフィール upsert・consent・monthlyIncome・
weekly settings・internal user lookup）も4層へ移行済み。既存の
`lib/domain/users/`（clerkProfile・displayName・email・monthlyIncome）と
`lib/domain/week/weekDates.ts` を再利用し、endpoint 向けのストアポートと
フィールド構築ルールを追加した。

- **純粋関数**（`lib/domain/users/`）: `store.ts`（`UserRecord`・`UserStore`
  ポート）と `rules.ts`（identity 由来の insert/patch フィールド構築・
  displayName 解決・User not found 検証）。
- **ユースケース**（`lib/usecase/users/`）: upsertUser（insert/patch 分岐）、
  consent（既設定時刻を保持する冪等 patch）、updateMonthlyIncome（null で
  undefined クリア）、updateWeeklyDays（weeklyEndDay は開始曜日から導出）、
  getUserProfile/getReceiptImageConsent、internal upsert/getUserIdByEmail/
  getUserById/clearUserMonthlyIncome、共有 `getWeeklyStartDayForUser`。
- **インフラ**（`lib/convex/users/`）: `UserStore` の Convex 実装
  （`createUserStore`）と query 用読み取り専用 `createUserReader`、
  Doc/Record 変換。by_token_identifier・by_email インデックス利用を隔離する。
- **プレゼンテーション**: `convex/users/*.ts` は endpoint・validator・
  `requireAuthenticatedUserId` 等の認証境界・互換export（`*Handler`）のみ。
  `weeklySettings.ts` は他ドメイン向け共有 helper の薄い委譲を維持する。
  endpoint名、args/returns、エラー文言、undefined クリア挙動、consent 冪等性、
  internal upsert の email trim+小文字化（空文字保持）は不変とする。

`weekSessions`（週次セッションの get-or-create・reviewMemo 更新・complete・
E2E reset・取得）も4層へ移行済み。週の日付計算は既存 `lib/domain/week/weekDates.ts`
を再利用する。

- **純粋関数**（`lib/domain/weekSessions/`）: `store.ts`（`WeekSessionRecord`・
  `WeekSessionStore` ポート）と `rules.ts`（ローカル日付 YYYY-MM-DD 生成、
  新規 draft フィールド構築、complete patch（reviewMemo は指定時のみキー含有）、
  reset patch（reviewMemo を undefined で明示クリア）、not found / retrieve 失敗検証）。
- **ユースケース**（`lib/usecase/weekSessions/`）: getOrCreate（既存返却・無ければ
  insert→get）、updateReviewMemo・complete（patch→get）、reset（`{reset}` 返却）、get。
- **インフラ**（`lib/convex/weekSessions/`）: `WeekSessionStore` の Convex 実装
  （`createWeekSessionStore`）と query 用 `createWeekSessionReader`、Doc/Record 変換。
  by_group_id_and_week_start_date インデックス利用を隔離する。
- **プレゼンテーション**: `convex/weekSessions/*.ts` は endpoint・validator・
  `requireGroupMembership` 認可・互換export（`*Handler`）のみ。current 版は
  membership → 週開始曜日取得 → 指定週 handler へ委譲する既存の呼出順序を維持する。
  endpoint名、args/returns、エラー文言、Doc 返却形状、patch キー構成は不変とする。

`receiptImageExtraction`（レシート画像抽出 action）も4層へ移行済み。OpenAI client・
parse・mock 結果は既存の `lib/convex/receiptImageExtraction/` を再利用し、リクエスト構築
（プロンプト・JSONスキーマ・カテゴリ正規化）は `lib/domain/receiptImageExtraction/` へ統合済み。

- **純粋関数**（`lib/domain/receiptImageExtraction/`）: 既存 `mode.ts` に加え、
  `rules.ts`（imageDataUrl 検証、抽出計画解決: mode → real は production 限定 →
  mock → OPENAI_API_KEY 必須、グループ選択・同意検証）と `ports.ts`（環境読み取り・
  mock/real extractor・group/consent/categories 読み取りポート）、
  `extractionRequest.ts`（抽出リクエスト構築: `ReceiptCategoryHint`/`CategoryInput` 型、
  BiDi制御文字 sanitize・重複排除 `normalizeCategories`、プロンプト構築
  `buildReceiptExtractionPrompt`、JSONスキーマ `buildReceiptExtractionJsonSchema`、
  リクエストボディ `buildOpenAIReceiptExtractionRequestBody`）。
- **ユースケース**（`lib/usecase/receiptImageExtraction/`）: `extractReceiptFields`
  （検証 → 計画 → mock/real）と `extractReceiptFieldsForCurrentGroup`
  （group → consent+categories 並列取得 → 抽出）。
- **インフラ**（`lib/convex/receiptImageExtraction/extractorDeps.ts`）: process.env を
  呼出時に読む環境スナップショット、`getMockResult`/`callOpenAIReceiptExtractor` の合成、
  `runQuery` ベースのコンテキスト読み取り。
- **プレゼンテーション**: `convex/receiptImageExtraction/extraction.ts` は action・
  validator・`requireAuthenticatedUserId`・互換export（`extractReceiptFieldsFromImage`・
  `extractReceiptFieldsHandler`・型/関数再export）のみ。ドメインエラーだけを
  ConvexError へ変換し、判定順序と全エラー文言は不変とする。

`aiExpenseDrafts` のレビュー明細置換（`replaceDraftItemsForReview`）は、infra に混在
していた業務ルールを `lib/domain/aiExpenseDrafts/` へ分離済み。

- **純粋関数**: `reviewItemReplace.ts`（明細上限100、itemId 重複/所属検証、previous
  からの税関連フィールド継承を含む置換明細フィールド構築、エラー文言変換）と
  `reviewCategory.ts`（レビュー用カテゴリ利用可否: 不在/他グループ・非アクティブ）。
- **ユースケース**: `assertActiveCategoryForDraft` は `reviewCategory.ts` へ委譲する。
- **インフラ**: `lib/convex/aiExpenseDrafts/reviewValidation.ts` は既存明細取得・削除・
  insert と Doc/Fields 変換のみを担い、判定順序（上限 → 取得 → ID 検証 → 削除 →
  各明細で名前/金額 → カテゴリ → insert）と文言は不変とする。

`receipts` 集計の新旧形式フォールバック判定も `lib/domain/receipt/legacyFallback.ts`
へ分離済み。

- **純粋関数**: 種別フィルタ（receipts の `type` 未設定は支出扱い）、週収入の3値判定
  （new / none / legacy）、月・年集計での旧形式取得要否、`mapAggregationEntries`
  （種別ごとに独立フォールバック・categoryId 欠落エラー）、`groupDocsByMonth`、
  `resolveYearRange`。
- **インフラ**: `lib/convex/receipts/spendingEntries.ts` はインデックス取得・上限
  チェック・enrichment 取得と ConvexError 変換のみを担い、フォールバック条件・
  receipts 取得回数・文言は不変とする。

`aiExpenseDrafts` の作成（抽出結果 → 下書き）も `lib/domain/aiExpenseDrafts/createFromExtraction.ts`
へ分離済み。

- **純粋関数**: 分類 → AI 値スナップショット → ユーザー上書き適用 → 下書き insert
  フィールド構築（`receiptInterpretation` に AI 値を保持、`rawObservation` は行指定時のみ）、
  明細 insert フィールド構築、失敗下書き構築（failed / unknown / parse_failed）、
  カテゴリ所属判定（未指定は検証不要）。カテゴリ ID は総称型で永続化層の ID をそのまま通す。
- **インフラ**: `lib/convex/aiExpenseDrafts/createFromExtraction.ts` は group 認可解決・
  カテゴリ取得・insert / get と ConvexError 変換のみを担い、判定順序と文言は不変とする。

`aiExpenseDrafts` の税再解釈の永続化も `lib/domain/aiExpenseDrafts/taxInterpretationPlan.ts`
へ計画算出を分離済み。

- **純粋関数**: 適格性判定（不在 → 他グループ → 金額/税サマリ欠落。decisionOverride
  があれば税サマリ無しでも許可）、receiptTotalSource 解決（保存済み候補から amountYen
  一致の source、3値外は ai_estimate）、裏付け候補の除外、`planDraftTaxInterpretation`
  （再解釈 → 税/非税レビュー理由統合 → 再分類 → status → 明細 patch 配列＋下書き patch）。
  totalOnly は税詳細を無視して分類する。
- **インフラ**: `lib/convex/aiExpenseDrafts/persistTaxInterpretation.ts` は下書き/明細の
  取得・patch・再取得と ConvexError 変換のみを担い、判定順序・patch フィールド・文言は
  不変とする。

`expenseSearch`（履歴検索）の検索オーケストレーションも `lib/usecase/expenseSearch/searchExpenses.ts`
へ分離済み。

- **純粋関数**: `lib/domain/expenseSearch/searchResult.ts`（`ExpenseSearchReceipt` /
  `ExpenseSearchResult` 型、`emptySearchResult`、`collectCategoryIds`（収入グループ除外・
  重複排除）、`mapHistoryGroupToItems`（カテゴリ名 fallback「不明」・色 fallback
  「#AAB7C4」）、`ExpenseSearchDomainError`）。既存 `analytics.ts` / `filter.ts` の
  集計・フィルタ・ページング・前期間算出はそのまま利用する。
- **ユースケース**: `searchExpenses` はストアポート経由で、フィルタ検証 → カテゴリ
  所有権チェック（他グループなら空結果）→ 履歴読込 → グルーピング/フィルタ →
  初回ページのみ前期間読込・比較 → カテゴリ情報 → 集計 → ページング → 項目マッピング
  を逐語移植した順序で実行する。
- **インフラ**: `lib/convex/expenseSearch/searchExpenses.ts` は `requireGroupMembership`、
  `ctx.db` 取得（カテゴリ・履歴・カテゴリ情報）と `ExpenseSearchDomainError` の
  ConvexError 変換のみを担い、戻り値 shape・エラー文言・truncated 伝播は不変とする。

`groups` の Clerk 招待オーケストレーション（`inviteMember` / `cancelPendingGroupInvitation`）も
`lib/usecase/groups/clerkInvitationActions.ts` へ分離済み。

- **純粋関数**: `lib/domain/groups/invitationFlow.ts`（`ClerkInvitationDomainError`、
  グループ前提検証（未選択・非オーナー）、招待メール正規化、招待レコード入力構築）。
  リダイレクトURL・Clerk パラメータの純粋ルールは既存 `lib/domain/groups/clerkInvitations.ts`
  をそのまま利用する。
- **ユースケース**: グループ解決 → オーナー検証 → 認証ユーザー解決 → メール正規化 →
  トークン/リダイレクト生成 → ローカル予約 → Clerk 招待 → 失敗時の補償削除（warnして元
  エラー再送出）→ `clerkInvitationId` 追記、および取消時の revoke ループ（個別失敗は warn
  して継続）をストア/サービスポート経由で実行する。
- **インフラ**: `lib/convex/groups/clerkInvitationLib/inviteActions.ts` は
  runQuery/runMutation ブリッジ・`getClerkClient`（CLERK_SECRET_KEY）・
  `ClerkInvitationDomainError` の ConvexError 変換のみを担い、ハンドラ公開シグネチャ
  （ctx, args, deps）・エラー文言・console.warn 内容は不変とする。

`aiExpenseDrafts` の支出エントリ調整（`reconcileDraftExpenseEntries`）も
`lib/domain/aiExpenseDrafts/reconcileExpenseEntriesPlan.ts` へ計画算出を分離済み。

- **純粋関数**: `planExpenseEntryReconciliation`（既存100件上限、再利用選択
  （カテゴリ一致 → 未保持の先頭）、patch/insert フィールド構築、memo の非対称条件
  （patch は memoUpdate 指定時にキー含有・insert は value 指定時のみ）、削除対象算出）。
- **インフラ**: `lib/convex/aiExpenseDrafts/reconcileExpenseEntries.ts` は既存エントリ
  取得・各op適用前のカテゴリ検証委譲・patch/insert/delete 適用・結果ID順序維持と
  `ReconcileExpenseEntriesDomainError` の ConvexError 変換のみを担う。

`receipts` の集計ハンドラ群（週次・4週・日次推移・月次・年次サマリ）も
`lib/usecase/receipts/summaries.ts` へオーケストレーションを分離済み。

- **純粋関数**: `lib/domain/receipt/summaryEntries.ts`（`SummaryReceiptEntry` 型と
  `mapSpendingEntryToSummaryReceipt`。カテゴリ名 fallback「不明」・色 fallback
  「#AAB7C4」）。既存 `summary.ts` / `monthlySummary.ts` / `yearlySummary.ts` /
  `weekDates.ts` の集計・週算出はそのまま利用する。
- **ユースケース**: `SummaryStore` ポート経由で週/日/月/年のエントリ取得・前週算出・
  4週反復（降順取得→昇順反転）・日次7日ループ・カテゴリ情報取得・応答組立を行う。
  `prevWeekTotalAmountYen` の null 化（前週0件時）・4週 `weekCount`（0円週除外）・
  月次 `netAmountYen`（収入-支出）の算出もここに置く。
- **インフラ**: `lib/convex/receipts/summaryLib/summaryStore.ts` が `SummaryStore` を
  `ctx.db` / `spendingEntries` アダプタへ橋渡しする。`week.ts` / `monthly.ts` /
  `trend.ts` / `yearly.ts` の各ハンドラは `requireGroupMembership` と
  `normalizeMonth`/`normalizeYear` → `ConvexError("Invalid month"/"Invalid year")`
  の変換のみを担い、公開ハンドラ名・戻り値型・エラー文言は不変とする。
  `buildCategoryInfoMap` は `categoryAggregation.ts` の DB アダプタとして維持する。

`spendingEntries` のソース選択とレシートグループエンリッチメントの判定も
domain へ分離済み。

- **純粋関数**: `lib/domain/receipt/legacyFallback.ts` の
  `resolveSpendingEntriesSource`（新形式の支出エントリ有無で new/legacy）と
  `lib/domain/receipt/spendingEntry.ts` の `buildReceiptEnrichmentMaps`
  （sourceDocument/aiExpenseDraft のグループ所有権フィルタ、明細の
  `categoryId && itemName` 有効項目フィルタ、参照map構築）。
- **インフラ**: `lib/convex/receipts/spendingEntries.ts` は期間クエリ・上限チェック
  （`MAX_DATE_RANGE_ENTRIES`/`MAX_YEAR_RANGE_ENTRIES`）・`ctx.db` 一括取得・
  ConvexError 変換のみを担い、新形式時はエンリッチメント付き新エントリ、
  無ければ旧 receipts+`addLegacyReceiptGroups` への分岐順は不変とする。

`expenseSearch` の履歴ロードの合成規則も `lib/domain/expenseSearch/searchEntries.ts`
へ分離済み。

- **純粋関数**: `dedupeSearchEntries`（`recordType:_id` キーのみで重複排除。
  日付・金額・名称での推測dedupeは行わない）、`partitionExpenseEntriesByKind` /
  `partitionReceiptsByKind`（種別振り分け。旧レシートの type 未設定は支出扱い）、
  `mergeSearchEntrySources`（新形式を先に結合してdedupe）。
- **インフラ**: `lib/convex/expenseSearch/loadSpendingEntries.ts` は新旧sourceの
  並列取得・`SEARCH_MAX_RECORDS` 上限と `truncated` 判定・エンリッチメント/
  マッピングアダプタ呼出のみを担い、公開シグネチャ・戻り値・truncated 伝播は
  不変とする。

`groups` の stale 招待判定も `lib/domain/groups/groupInvitation.ts` へ分離済み。

- **純粋関数**: `assessGroupInvitationStaleness`（pending→stale、revoked/expired→keep、
  accepted+`acceptedByUserId` 無し→stale、accepted+有り→check_membership）。
- **インフラ**: `lib/convex/groups/invitationHandlers/staleCleanup.ts` はメール一致
  フィルタ・index クエリ（email→status 収集順）・check_membership 時のみ membership
  参照・`status: "revoked"` patch ループのみを担い、公開シグネチャは不変とする。

`aiExpenseDrafts` の `receiptUserOverride` スナップショット永続化も domain へ分離済み。

- **純粋関数**: `lib/domain/aiExpenseDrafts/receiptDataContract.ts` の
  `snapshotReceiptDraftValues`（draft・明細のフィールド射影。warnings 未設定は
  空配列へ正規化）と `buildReceiptUserOverride`（fields の和集合マージ・
  `source: "user"` 組立）。
- **インフラ**: `lib/convex/aiExpenseDrafts/receiptDataContract.ts` は draft get・
  所有権チェック（`groupId` 不一致または不存在で Error・文言維持）・明細
  `by_group_id_and_draft_id` asc take(100)・patch・再取得のみを担い、
  `persistReceiptUserOverrideSnapshot` / `snapshotReceiptDraftValues` /
  `resetReceiptToAiInterpretationHandler` の公開シグネチャは不変とする。

### 5.4 スタイリング責務

MUIとTailwind CSSは併用するが、責務を分ける。

| 対象         | 担当                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| MUI theme    | 色、Typography、角丸、影、コンポーネント標準スタイル                       |
| MUI `sx`     | MUIコンポーネント単位の微調整、状態依存、theme参照が必要なスタイル         |
| MUI `styled` | 再利用する独自コンポーネントや複雑なスタイル                               |
| Tailwind CSS | ページ全体のflex/grid、gap、padding、responsive、表示/非表示、外側ラッパー |

Tailwind CSSはレイアウト用途に限定する。`Button`、`TextField`、`Chip`、`Alert`、`Snackbar`、`Table` などのMUIコンポーネントの色、サイズ、角丸、状態表現はMUI themeを正とする。

MUIコンポーネント内部をTailwind CSSで深く上書きしない。必要な場合は、まずMUI theme、`sx`、`slotProps`、`styled` の順で検討する。

## 6. 認証設計

Clerkを認証プロバイダーとして使い、Googleアカウント認証のみをMVP対象にする。

Convexとは `ConvexProviderWithClerk` で連携する。`ClerkProvider` の内側に
`ConvexProviderWithClerk` を置き、`useAuth` を渡してConvexへClerkの認証トークンを
送る。フロントエンドでは、Clerkログイン済みであってもConvex側の認証が完了するまで
家計簿画面を表示しない。

Convex functionでは必ず `ctx.auth.getUserIdentity()` を使ってユーザーを確認する。
未認証の場合は処理を拒否し、公開query/mutation/actionではクライアントから渡された
`userId` を認可判断に使わない。

ユーザー識別子は、Clerkの素のuser idではなく、Convex `UserIdentity` の
`tokenIdentifier` を正とする。`userId` は users と groupMembers の識別に使い、
家計データの認可は `groupId` を基準に行う。receipt、category、weekSession などの
家計データは `groupId` で絞り込み、ID指定で更新または削除する場合も、取得した
ドキュメントの `groupId` と認証ユーザーの所属グループが一致することを確認する。

`users` テーブルはClerkプロフィールのキャッシュまたはアプリ内表示名の保存が必要に
なった場合に使う。MVPの認可は `users` テーブルの存在に依存せず、
`ctx.auth.getUserIdentity()` の結果を基準に行う。

### 6.1 家族グループ公開方針

MVP時点の共有単位は家族グループとする。1ユーザーは複数グループに所属でき、現在操作
対象のグループは `users.activeGroupId` で保持する。グループ未所属のユーザーはログイン後に
グループ作成画面へ誘導し、複数グループに所属しているが activeGroupId が未設定のユーザーは
グループ選択画面へ誘導する。Clerk Allowlistは本番利用で有料機能になるため、Clerk Restricted
mode と invitation を入口制限として採用する。

- Clerk DashboardでRestricted modeを有効化する
- 家族グループのオーナーは設定画面からClerk invitationを経由してメンバーを招待する
- 招待リンクにはアプリ側の招待トークンを含め、受け入れ時に `groupMembers` へ追加する
- 誰でもGoogleログインまたはサインアップできる状態にはしない
- invitation対象メールはアプリコード、Git管理ファイル、環境変数に持たせない
- Restricted modeはアプリ入口の制限であり、Convexデータ認可の代替にはしない
- データ認可は `groupId` と `groupMembers` で行い、オーナー/メンバーの2段階権限を使う

### 6.2 認証テスト方針

Convex関数を実装する時点で、未認証の場合に拒否されること、認証済みの場合に
自分の所属グループのデータだけを扱うことをテストする。所有者チェックが必要な更新・削除は、
他グループのドキュメントIDを渡しても拒否されることを確認する。

### 6.3 グループ運用手順

管理機能 Phase1/Phase2 の境界、`owner` / `member` の権限差、危険操作の扱いは
`docs/group-admin-permissions.md` を正本とする。本節は運用フローの概要のみ記載する。

グループ所属の正本は `groupMembers` テーブルとする。Clerk invitation は
招待メール送信とサインアップ/サインイン導線に使い、誰がどのグループに所属するかは
アプリ側の `groupMembers` で管理する。

運用の流れは次のとおり。

1. オーナーが `/group/setup` で家族グループを新規作成する。
2. グループ作成時に、作成者は `groupMembers` へ `owner` として追加される。
3. オーナーは `/settings` の「グループ管理」で対象メールアドレスを入力し、Clerkを経由して招待を送る。
4. 招待リンクには `/group/invitations/accept?token=...` への戻り先を設定する。
5. 招待されたユーザーがリンクから認証を完了すると、アプリは招待トークンを検証し、
   `groupMembers` へ `member` として追加する。
6. 追加されたグループは `users.activeGroupId` に設定され、通常画面へ進める。
7. 複数グループに所属しているユーザーは `/group/select` または設定画面から表示対象グループを切り替える。
8. メンバーを外す場合は、オーナーが `/settings` からそのユーザーを削除する。
9. 削除対象ユーザーの activeGroupId が削除されたグループだった場合、残りの所属グループへ切り替える。
10. メンバーのグループ解除、ロール変更、オーナー権限譲渡、グループ削除の実行時には、影響を受けたメンバーへメール通知を送信する。

この運用では、次の制約を前提にする。

- 1ユーザーは同時に複数グループへ所属できる。
- `acceptGroupInvitation` は、招待メールとログイン中ユーザーのメールが一致する場合だけ所属を追加する。
- `setActiveGroup` は、ログイン中ユーザーが所属しているグループだけを active にできる。
- `removeMember` はユーザー本人の `users` レコードや Clerk アカウントは削除しない。
- `requestGroupDeletion` はjob作成、`groups.status = deleting`、依頼者の`activeGroupId`解除を同一transactionで行い、bounded workerへ委譲する。Clerk アカウントや`users`レコードは削除しない（#224）。
- owner削除のworkerは`recipientSnapshot → startedEnqueue → purge registry → finalSweep → completedEnqueue → recipientCleanup`の順で進める。通知はbusiness keyでdedupeし、全recipientのenqueue/skipとcleanup完了後だけjobを`completed`にする。
- deleting groupは通常のmembership解決と招待受諾から除外し、background処理も結果保存transactionでgroup lifecycleを再確認する。
- `transferGroupOwnership` と `requestGroupDeletion` は owner のみが UI と mutation から実行できる。
- グループ未所属または activeGroupId 未選択のユーザーは、設定や家計データへ進めない。

### 6.4 システム管理者の認可

システム管理者権限は `groupMembers.role` や Clerk metadata から分離し、Convex の
`systemAdmins` を正本とする。全管理 API は `requireSystemAdmin` を入口で実行し、
active record が確認できない場合は fail closed にする。

システム管理者は管理情報だけを扱い、家計データのグループ認可を迂回できない。
現行コードでは `systemAdmins` テーブル、関連 API、`/admin` UI は実装済みである。
設計の正本は `docs/system-admin-authorization.md` を参照する。

## 7. 画面とルーティング

| パス                           | 画面               | 目的                                       |
| ------------------------------ | ------------------ | ------------------------------------------ |
| `/`                            | ダッシュボード     | 今週の支出、カテゴリ別支出、入力状態を確認する |
| `/weeks/current/input`         | 今週のレシート入力 | レシートを連続入力する                     |
| `/weeks/:weekStartDate`        | 週次サマリー       | 指定週の集計、支出一覧を確認する           |
| `/settings`                    | 設定               | グループ、カテゴリ、週の開始曜日を設定する（終了曜日は自動） |
| `/categories`                  | 設定               | `/settings` と同じ設定画面への互換ルート   |
| `/group/setup`                 | グループ作成       | グループ未所属ユーザーが家族グループを作成する |
| `/group/select`                | グループ選択       | 複数所属ユーザーが表示対象グループを選ぶ     |
| `/group/invitations/accept`    | 招待受け入れ       | Clerk招待後にアプリ側の所属追加を完了する   |
| `/group/delete/status/:jobId`  | グループ削除状況   | original requesterが非同期削除の状態確認・再開を行う |
| `/privacy`                     | プライバシーポリシー | 認証不要で閲覧する                         |
| `/terms`                       | 利用規約           | 認証不要で閲覧する                         |
| `/maintenance`                 | メンテナンス       | 認証不要でメンテナンス表示する             |
| `/sso-callback`                | 認証コールバック   | Clerk SSO後のコールバックを処理する         |
| `/__e2e__/ai-expense-queue`    | E2E専用画面        | 開発時または release candidate E2E build のみAI支出下書きキューを検証する     |
| `/__e2e__/input-workbench`     | E2E専用画面        | 開発時または release candidate E2E build のみ入力ワークベンチのレイアウトを検証する |
| `/__e2e__/ai-expense-queue-expense-entries` | E2E専用画面 | 開発時または release candidate E2E build のみ expenseEntries 登録を検証する |
| `/guide` | 使い方 | アプリ内ガイドを表示する |
| `/updates` | 更新履歴 | ユーザー向け更新履歴を表示する |
| `/settings/account/delete` | アカウント削除 | アカウント削除をリクエストする |
| `/settings/account/delete/status` | アカウント削除状況 | 非同期アカウント削除の状況を確認する |
| `/admin` | システム管理者画面 | ユーザー・グループ検索、詳細、監査ログ、権限管理、削除失敗復旧など（`SystemAdminRouteGuard`） |

現行コードには `/sign-in`、`/weeks/:weekStartDate/review`、`/export` の個別ルートはない。
サインイン画面は `App.tsx` の未認証表示で扱う。振り返りメモとセッション完了UIは表示せず、
既存データ互換のためバックエンドのフィールドとmutationだけを維持する。

## 8. データ設計

家計簿の中心データは `expenseEntries` に寄せ、入力元原本は `sourceDocuments` を正本とする。
`receipts` は既存データ互換のため当面残す。これらの詳細な schema と互換方針は
21 節も参照。

### 8.1 users

| 項目                                      | 型                | 説明                                           |
| ----------------------------------------- | ----------------- | ---------------------------------------------- |
| userId                                    | string            | `UserIdentity.tokenIdentifier`                 |
| displayName                               | string            | 表示名                                         |
| email                                     | string (optional) | メールアドレス                                 |
| monthlyIncome                             | number (optional) | 月収入。現行UIからの設定導線は削除済み         |
| weeklyStartDay                            | number (optional) | 週の開始曜日（0=日曜、1=月曜）。未設定は月曜   |
| weeklyEndDay                              | number (optional) | 週の終了曜日（0=日曜、1=月曜）。weeklyStartDay の6日後として自動算出・保存。未設定は weeklyStartDay 未設定時の日曜 |
| receiptImageExternalApiConsentAcceptedAt  | number (optional) | レシート画像を外部APIへ送信することへの承認時刻 |
| createdAt                                 | number            | 作成日時                                       |
| updatedAt                                 | number            | 更新日時                                       |

### 8.2 receipts

| 項目          | 型                | 説明                           |
| ------------- | ----------------- | ------------------------------ |
| groupId       | Id<"groups">      | 家計データの所有境界となるグループID |
| date          | string            | 入出金日。`YYYY-MM-DD`         |
| type          | `expense` / `income` (optional) | 種別。未設定は既存互換で支出扱い |
| shopName      | string (optional) | 店名。支出で使う               |
| bankName      | string (optional) | 銀行名。収入で使う             |
| amountYen     | number            | 金額。日本円の整数             |
| categoryId    | Id<"categories">              | カテゴリID（schema 上は必須。収入レコードは互換層として残存） |
| memo          | string (optional) | 任意メモ                       |
| weekStartDate | string            | 所属週の開始日。`YYYY-MM-DD`   |
| createdAt     | number            | 作成日時                       |
| updatedAt     | number            | 更新日時                       |

### 8.3 weekSessions

| 項目            | 型                    | 説明                           |
| --------------- | --------------------- | ------------------------------ |
| groupId         | Id<"groups">          | 家計データの所有境界となるグループID |
| weekStartDate   | string                | 週開始日                       |
| weekEndDate     | string                | 週終了日                       |
| reviewMemo      | string (optional)     | 振り返りメモ                   |
| status          | `draft` / `completed` | セッション状態                 |
| createdAt       | number                | 作成日時                       |
| updatedAt       | number                | 更新日時                       |

### 8.4 categories

| 項目      | 型      | 説明                           |
| --------- | ------- | ------------------------------ |
| groupId   | Id<"groups"> | 家計データの所有境界となるグループID |
| name      | string  | カテゴリ名                     |
| color     | string  | 表示色                         |
| isActive  | boolean | 新規入力で利用可能か           |
| sortOrder | number  | 表示順                         |
| createdAt | number  | 作成日時                       |
| updatedAt | number  | 更新日時                       |

### 8.5 aiExpenseDrafts

支出AI登録では、AI解析結果を既存 `receipts` に直接保存せず、未確定の下書きとして
`aiExpenseDrafts` に保存する。下書きも家計データと同じくグループ所有データであり、
`groupId` を保存する。query/mutation/action ではクライアントから渡された `userId` を
信用せず、サーバー側で取得した認証ユーザーの active group と下書きの `groupId` が一致することを確認する。

| 項目                | 型                                                                 | 説明                                  |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| groupId             | Id<"groups">                                                       | 家計データの所有境界                  |
| sourceType          | `image_upload`                                                     | 下書きの作成元                        |
| status              | `queued` / `analyzing` / `ready` / `needs_review` / `failed` / `registered` | AI処理と登録の状態                    |
| documentType        | `receipt` / `convenience_payment` / `unknown`                      | 書類種別                              |
| imageFileName       | string (optional)                                                  | レシート画像ファイル名（既存 dev 下書き互換） |
| shopName            | string (optional)                                                  | レシート上の店名                      |
| paymentPlace        | string (optional)                                                  | 実際に支払った場所                    |
| payeeName           | string (optional)                                                  | お金の行き先                          |
| paymentPurpose      | string (optional)                                                  | 支払内容                              |
| date                | string (optional)                                                  | 支出日。`YYYY-MM-DD`                  |
| amountYen           | number (optional)                                                  | 合計金額。日本円の整数                |
| taxSummaries        | array (optional)                                                   | 税率別集計。各要素は `taxRatePercent`/`taxMode`/`taxableAmountYen`/`taxableAmountBasis`/`taxYen`/`taxIncludedAmountYen`/`roundingMethod`/`confidence`/`warnings`/`status`/`reasons` を含む |
| markerDefinitions   | array (optional)                                                   | レシート印字に含まれる税記号・マーカーの定義 |
| categoryId          | Id<"categories"> (optional)                                        | 登録候補カテゴリ                      |
| confidence          | object                                                             | 主要フィールドごとのAI信頼度          |
| warnings            | string[] (optional)                                                | 解析時の警告                          |
| reviewReasons       | fixed enum array                                                   | 確認が必要な理由                      |
| registeredReceiptId | Id<"receipts"> (optional)                                          | レガシー `registerReadyDrafts` 用。主導線では未設定 |
| createdAt           | number                                                             | 作成日時                              |
| updatedAt           | number                                                             | 更新日時                              |

`reviewReasons` は文字列自由入力ではなく、UI表示と分類ロジックで扱える固定 enum とする。
値は `low_confidence`、`missing_required_field`、`ambiguous_document_type`、
`ambiguous_category`、`multiple_categories`、`user_confirmation_required`、
`amount_mismatch`、`parse_failed` とする。

分類ロジックでは、主要フィールドの信頼度しきい値を `0.8` とする。レシート下書きは
日付、1円以上の金額、店名または支払先相当の名称、カテゴリ候補、主要フィールドの信頼度が
揃っている場合に `ready` とする。自動解析されたコンビニ払込票は支払先と支払内容の両方が必要であり、
不足する場合は `needs_review` として `missing_required_field` を付与する。レビュー編集時はこれらを
「店名・内容」へ統合した `shopName` で補正できる。

`unknown` の書類種別、カテゴリ未確定、AI警告、主要フィールドの低信頼度、下書き金額と明細合計の
不一致がある場合も `needs_review` とし、該当する `reviewReasons` を保存する。
明細が2カテゴリ以上に分かれた場合は `multiple_categories` として `needs_review` にし、ユーザーが
カテゴリ別登録候補を確認した更新時だけ確認済みとして `ready` へ遷移できる。
画像解析直後は `user_confirmation_required` を付与して常に `needs_review` とする。確認フォームから
`updateForReview` を実行すると当該理由を除去し、確定したレシート記載日を `draft.date` に保存する。
カテゴリ別に生成する全 `expenseEntries.date` はこの確定日を使い、`createdAt` は登録時刻に限定する。

AI支出下書き一覧の画像プレビューは、画像送信時にクライアントのReact stateで保持している
リサイズ済みData URLを利用する。画像本体は `aiExpenseDrafts`、`receiptAnalysisImageJobs`、
Convex Storageへ保存しないため、ページ更新・別端末・別セッションではプレビューできない。
同時に選択または撮影した画像群は、クライアントの `sessionBatches` に `batchId`、対象ジョブID、
ファイル名だけを保持し、`listJobs` の `jobId` / `draftId` と結合して同一バッチの進捗を表示する。
バッチ情報も永続化せず、複数バッチの登録対象を混在させない。
失敗ジョブの「再解析」は同じセッションの画像を再送し、「再撮影」はカメラまたはファイルから
新しい画像を選んで同じジョブを再試行する。保存済みの `needs_review` ジョブも同じ再解析導線を
利用でき、セッション画像がなければ画像を選び直す。解析完了時は旧下書きの `updatedAt` を検証し、
再解析中にユーザーが編集した場合は新しい解析結果を破棄して旧下書きを維持する。画像品質の失敗ヒントは固定の一般案内であり、自動画質診断ではない。

バッチの「まとめて登録」は、紐付く全ジョブが `ready` であり、登録準備OKの下書きIDが
同一バッチ内で揃った場合だけ有効にする。`queued` / `running`、`needs_review`、`failed`、
ジョブ未反映が残る間は無効とし、個別の確認・再試行・削除による既存の状態遷移を利用する。
初期表示の下書きなどセッションバッチに属さない項目は、従来どおり個別選択の一括登録対象とする。

画像解析では所属グループの有効カテゴリ名を先に取得し、OpenAIのプロンプトへ命令ではなくJSONデータとして渡す。
構造化出力の `categoryName` は空文字列または有効カテゴリ名の動的 enum に制限し、下書き全体と各明細で
アプリのカテゴリ名へ完全一致させる。返却後は従来どおりサーバー側で `categoryId` を解決する。

### 8.6 aiExpenseDraftItems

明細行は親ドキュメントの配列にせず、`aiExpenseDraftItems` として別テーブル化する。
MVPの画面で全明細を常時表示しない場合でも、将来の複数カテゴリ登録へ安全に拡張できる
構造にする。

| 項目                 | 型                          | 説明                                           |
| -------------------- | --------------------------- | ---------------------------------------------- |
| groupId              | Id<"groups">                | 家計データの所有境界                             |
| draftId              | Id<"aiExpenseDrafts">       | 親下書きID                                     |
| itemName             | string                      | 明細名                                         |
| amountYen            | number                      | 編集用金額。値引き明細のみ負数                   |
| printedAmountYen     | number (optional)           | レシート印字額                                 |
| amountBasis          | enum (optional)             | `tax_included` / `tax_excluded` / `unknown`    |
| taxRatePercent       | 0 / 8 / 10 / null (optional) | 税率                                        |
| markers              | string[] (optional)         | 印字上の税マーカー一覧（複数可）               |
| taxMarker            | string (optional)           | 印字上の税マーカー（単一、互換）               |
| allocatedTaxYen      | number (optional)           | 按分税額                                       |
| normalizedAmountYen  | number (optional)           | 登録用正規化金額                               |
| taxResolutionStatus  | `resolved` / `unresolved` (optional) | 税情報の解決状態                               |
| taxResolutionSource  | enum (optional)             | `item_explicit` / `single_summary` / `summary_reconciliation` / `remaining_summary` / `marker_reconciled` / `paid_total_reconciliation` |
| taxReviewReasons     | string[] (optional)         | 税関連の確認・警告理由                         |
| quantity             | number (optional)           | 数量                                           |
| unitPriceYen         | number (optional)           | 単価                                           |
| categoryName         | string (optional)           | AI が返したカテゴリ名                          |
| categoryId           | Id<"categories"> (optional) | 明細候補カテゴリ                               |
| confidence           | object                      | 明細フィールドごとのAI信頼度                   |
| warnings             | string[] (optional)         | 明細単位の税・金額警告                         |
| createdAt            | number                      | 作成日時                                       |
| updatedAt            | number                      | 更新日時                                       |

登録時は `normalizedAmountYen` を優先し、未設定時は `amountYen` を使う。税額集計行（例: 消費税計）は明細として登録しない。

## 9. Convex index設計

| テーブル     | index                                     | 用途                                               |
| ------------ | ----------------------------------------- | -------------------------------------------------- |
| users        | `by_token_identifier`                     | `UserIdentity.tokenIdentifier`からユーザーを取得   |
| groupMembers | `by_user_id` | ログイン中ユーザーの所属グループ取得 |
| groupMembers | `by_group_id` | グループのメンバー一覧取得 |
| groupMembers | `by_group_id_and_user_id` | 所属重複確認・削除対象確認 |
| groupInvitations | `by_token` | 招待受け入れ時のトークン検証 |
| receipts     | `by_group_id_and_week_start_date`          | 指定グループ、指定週の支出取得                     |
| receipts     | `by_group_id_and_date`                     | 指定グループ、期間指定の支出取得                   |
| receipts     | `by_group_id_and_shop_name`                | 店名候補、カテゴリ推定                             |
| weekSessions | `by_group_id_and_week_start_date`          | 指定グループ、指定週のセッション取得               |
| categories   | `by_group_id_and_is_active_and_sort_order` | 有効カテゴリの表示                                 |
| categories   | `by_group_id_and_sort_order`               | カテゴリ設定画面、無効化済みカテゴリを含む履歴表示 |
| aiExpenseDrafts | `by_group_id_and_status_and_created_at` | 指定グループのキューを状態別・作成順で取得         |
| aiExpenseDrafts | `by_group_id_and_created_at` | 指定グループの下書き一覧を作成順で取得             |
| aiExpenseDrafts | `by_group_id_and_registered_receipt_id` | receipt登録済み下書きの参照・重複登録防止          |
| aiExpenseDraftItems | `by_group_id_and_draft_id` | 所属グループ確認済みの明細取得                     |
| aiExpenseDraftItems | `by_draft_id` | 下書きに紐づく明細取得（グループ確認は呼び出し側で実施） |
| sourceDocuments | `by_group_id_and_status_and_created_at` | 入力元の状態別一覧 |
| sourceDocuments | `by_group_id_and_date` | 期間指定の入力元取得 |
| expenseEntries | `by_group_id_and_date` | 期間指定の支出項目取得 |
| expenseEntries | `by_group_id_and_category_id_and_date` | カテゴリ別期間集計 |
| expenseEntries | `by_group_id_and_source_document_id` | 入力元に紐づく支出項目 |
| expenseEntries | `by_group_id_and_ai_expense_draft_id` | AI下書きに紐づく支出項目 |
| receiptAnalysisBatches | `by_group_id_and_status` | バッチ状態別取得 |
| receiptAnalysisBatches | `by_group_id_and_created_at` | バッチ一覧 |
| receiptAnalysisImageJobs | `by_batch_id` | バッチ内ジョブ取得 |
| receiptAnalysisImageJobs | `by_group_id_and_status` | グループ・状態別ジョブ取得 |
| receiptAnalysisImageJobs | `by_draft_id` | 下書きに紐づく解析ジョブ |
| managementAuditLogs | `by_group_id_and_created_at` | グループ管理操作ログ |

## 10. Convex function設計

Convex API は `api.<module>.<queries|mutations|actions>.<functionName>` 形式で参照する。

### 10.1 手入力（expenseEntries）

現行の入力 UI（`ExpenseEntryForm`）は `expenseEntries` を正本とする。

1枚の入力元を複数カテゴリへ分ける場合も、1件に複数カテゴリIDを保持せず、カテゴリ別の
`expenseEntries` を作成する。AI下書きの値引きは `aiExpenseDraftItems` で負数として保持し、
登録時に同一カテゴリ内で合算する。カテゴリ別正味額が0円以下になる場合は登録しない。

- `expenseEntries.mutations.createExpenseEntries(input)`
- `expenseEntries.mutations.updateExpenseEntry(id, input)`
- `expenseEntries.mutations.deleteExpenseEntry(id)`
- `expenseEntries.mutations.bulkUpdateSpendingCategories({ expenseEntryIds, receiptIds, categoryId })`
- `expenseEntries.mutations.bulkDeleteSpendingRecords({ expenseEntryIds, receiptIds })`
- 上記2つの成功時は同一mutationで `managementAuditLogs` に
  `spending_bulk_category_changed` / `spending_bulk_deleted` を1件記録する。
  `afterValue` には件数・対象ID・日付・カテゴリID/名前だけを入れ、金額・店名・メモは保存しない。
  閲覧は既存の `groups.auditLogs.listManagementAuditLogs`（ownerのみ）を使う。

### 10.2 receipts（互換層）

- `receipts.crud.createReceipt(input)`（レガシー。本番入力 UI では未使用）
- `receipts.crud.updateReceipt(id, input)`
- `receipts.crud.deleteReceipt(id)`
- `receipts.summaries.getReceiptsByWeek(weekStartDate)`
- `receipts.summaries.getWeekSummary(weekStartDate)`
- `receipts.summaries.getWeekSummaryWithCategories(weekStartDate)`
- `receipts.summaries.getFourWeeksSummary()`
- `receipts.summaries.getDailySpendingTrend(weekStartDate)`
- `receipts.summaries.getMonthlyExpensesSummary(month?)`
- `receipts.crud.deleteReceiptsByUser(groupId, userId)`（internal。指定ユーザーの作成データだけを対象）

`receipts` は支出と収入の両方を扱う schema 互換として残る。新規手入力は `expenseEntries` を正本とし、
収入は `entryType: "income"`、カテゴリなし、入力内容を `title` に保存する。

集計は `lib/convex/receipts/spendingEntries.ts` が `expenseEntries` と `receipts` を統合する（`convex/receipts/spendingEntries.ts` は re-export ラッパー）。

### 10.3 weekSessions

- `weekSessions.mutations.getOrCreateCurrentWeekSession()`
- `weekSessions.mutations.getOrCreateWeekSession(weekStartDate)`
- `weekSessions.queries.getWeekSession(weekStartDate)`
- `weekSessions.mutations.updateReviewMemo(weekStartDate, reviewMemo)`
- `weekSessions.mutations.completeWeekSession(weekStartDate)`
- `weekSessions.internal.resetWeekSessionForUser(groupId)`（internal）

### 10.4 categories

- `categories.mutations.seedDefaultCategories()`
- `categories.queries.listActive()`
- `categories.queries.listForSettings()`
- `categories.mutations.createCategory(input)`
- `categories.mutations.updateCategory(id, input)`
- `categories.mutations.deactivateCategory(id)`
- `categories.internal.deleteE2eCategoriesByUser(groupId)`（internal）

### 10.5 users

- `users.mutations.upsertUser()`
- `users.queries.getUserProfile()`
- `users.queries.getReceiptImageConsent()`
- `users.mutations.acceptReceiptImageExternalApiConsent()`
- `users.mutations.updateMonthlyIncome(monthlyIncome)`
- `users.mutations.updateWeeklyDays(weeklyStartDay, weeklyEndDay)`
- `users.internal.clearUserMonthlyIncome(userId)`（internal）

週の開始・終了曜日は `users` に保存する。`weeklyEndDay` は `weeklyStartDay` から
`getWeekEndDay()` で自動算出し、7日間の週が維持されるよう整合性を保つ。
週計算・週セッション作成・週次サマリーの集計範囲には `weeklyStartDay` が反映される。

### 10.6 export

現行コードには `convex/export.ts`、CSV生成関数、`/export` 画面はない。CSVは将来の
バックアップ導線として残すが、実装済み機能として扱わない。

### 10.7 receipt image consent

- `users.queries.getReceiptImageConsent()`
- `users.mutations.acceptReceiptImageExternalApiConsent()`

レシート画像入力PoCでは、画像を外部APIへ送信する前にユーザー単位の同意状態を確認する。同意状態は `users.receiptImageExternalApiConsentAcceptedAt` に承認時刻として保存する。

この同意は画像送信の可否判定だけに使い、receipt 保存の認可やユーザー識別には使わない。認可は従来どおり `ctx.auth.getUserIdentity()` から得た `tokenIdentifier` を基準にする。

### 10.8 AI expense drafts

- `aiExpenseDrafts.queries.listByStatus(status)`
- `aiExpenseDrafts.queries.getWithItems(draftId)`
- `aiExpenseDrafts.mutations.updateForReview(draftId, input)`
- `aiExpenseDrafts.mutations.deleteDraft(draftId)`
- `aiExpenseDrafts.mutations.updateDraftItemTaxOverrides(draftId, itemId, taxRatePercent?, amountBasis?)`
- `aiExpenseDrafts.mutations.updateSummaryTaxOverrides(draftId, summaryIndex, taxRatePercent?, taxMode?, taxableAmountYen?, taxYen?, ...)`
- `aiExpenseDrafts.mutations.applyReceiptTaxSettings(draftId, taxRatePercent?, amountBasis?)`
- `aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries(draftIds)`（主導線）
- `aiExpenseDrafts.mutations.registerReadyDrafts(draftIds)`（レガシー。`receipts` へ登録し `registeredReceiptId` を設定）
- `aiExpenseDrafts.actions.analyzeReceiptImageToDraft(input)`
- `aiExpenseDrafts.internal.createFromExtraction(input)`（internal）
- `aiExpenseDrafts.internal.createFailedDraftFromImageAnalysis(input)`（internal）

### 10.9 receipt analysis jobs

- `receiptAnalysisJobs.mutations.createBatch(input)`
- `receiptAnalysisJobs.queries.listBatches()`
- `receiptAnalysisJobs.queries.listJobs()`
- `receiptAnalysisJobs.queries.listJobsByBatch(batchId)`
- `receiptAnalysisJobs.queries.getJobByDraftId(draftId)`
- `receiptAnalysisJobs.actions.analyzeImageJob(jobId, imageDataUrl)`
- `receiptAnalysisJobs.mutations.retryImageJob(jobId)`
- `receiptAnalysisJobs.mutations.cancelImageJob(jobId)`
- `receiptAnalysisJobs.internal.finalizeBatchStatus(batchId)`（internal）
- `receiptAnalysisJobs.internal.getBatchById(batchId)`（internal）
- `receiptAnalysisJobs.internal.countNeedsReviewJobsByBatchId(batchId)`（internal）
- `receiptAnalysisJobs.actions.checkAiReviewRequired(batchId)`（internal action）

バッチ画像解析は `receiptAnalysisBatches` / `receiptAnalysisImageJobs` テーブルで管理する。
各ジョブは `analyzeImageJob` action で非同期に処理され、完了時に internal の `finalizeBatchStatus` でバッチ状態を更新する。

`createBatch` 時に `receiptAnalysisBatches.createdByUserId` に実行ユーザーの `tokenIdentifier` を保存する。
ジョブが `needs_review` など terminal 状態に更新されると、`updateJobStatus` は `aiReviewNotificationScheduledAt` を記録し、
60 分後に `checkAiReviewRequired` をスケジュールする。60 分後に `needs_review` ジョブが残っていれば、
`createdByUserId` に紐づくメールアドレスへ `ai_review_required` テンプレートの通知を送信する。
`aiReviewNotificationScheduledAt` は重複スケジュールを防ぐ。

下書きの作成・更新・登録処理では、必ず `ctx.auth.getUserIdentity()` と `groupMembers` から
active group を解決する。`draftId` や `categoryId` を受け取る処理では、取得したドキュメントの
`groupId` と認証ユーザーの active group が一致することを確認する。`aiExpenseDraftItems` は
`draftId` だけでなく `groupId` も保存し、明細単体の取得でもグループ境界を確認できるようにする。

`expenseEntries` への登録時は、既存の週次集計との互換性を優先する。変換方針は次の通り。

| 下書き種別 | 明細がない場合の `expenseEntries.title` 変換方針 |
| ---------- | ------------------------------------------------ |
| `receipt` | `shopName` を使う。空の場合は `payeeName`、`paymentPlace` の順に補完する。 |
| `convenience_payment` | `payeeName` と `paymentPurpose` を連結する。空の場合は `paymentPlace`、`shopName` の順に補完する。 |
| `unknown` | 確認が必要な下書きとして扱い、登録前にユーザーが必要項目を確定する。 |

主導線の `registerReadyDraftsAsExpenseEntries` は `expenseEntries` を作成し、下書きを `status: "registered"` に更新する。
`registeredReceiptId` は設定しない。レガシーの `registerReadyDrafts` のみ `receipts` を作成し `registeredReceiptId` を保存する。

既存データへの migration / backfill は不要とする。新しい下書きテーブルの追加のみで、
既存 `receipts`、`categories`、`weekSessions` の必須項目は変更しないため、既存データの読み取りは
維持される。

## 11. Valibotバリデーション

フォーム入力とConvex mutation引数の前処理でValibotを使う。

Convexにも引数validatorがあるため、Valibotだけに依存しない。フロントではValibot、Convex functionではConvex validatorsと認可チェックを併用する。

| 対象     | ルール                       |
| -------- | ---------------------------- |
| 種別     | `expense` または `income`    |
| 店名     | 支出では空文字不可。前後の空白は除去 |
| 銀行名   | 収入では空文字不可。前後の空白は除去 |
| 金額     | 1円以上9,999,999円以下の整数 |
| カテゴリ | 有効なカテゴリIDのみ         |
| 日付     | `YYYY-MM-DD` として扱える値  |
| メモ     | 任意。500文字以下            |

## 12. 主要ロジック

### 12.1 週計算

- 週の開始曜日は `users.weeklyStartDay` から決まり、未設定は月曜日
- `convex/lib/weekDates.calculateWeekStartDate(date, weekStartDay)` で対象日の週開始日を求める
- `calculateWeekEndDate(weekStartDate)` / `getWeekEndDay(weekStartDay)` で週終了日・終了曜日を求める
- 日付は `YYYY-MM-DD` 文字列として扱う

`users.weeklyStartDay` は週セッション作成、receipt / expenseEntries 保存時の `weekStartDate`、
週次サマリーの集計範囲に反映される。`weeklyEndDay` は `weeklyStartDay` から7日間になるよう
自動算出して保存する。

### 12.2 集計

週次サマリーでは、`lib/convex/receipts/spendingEntries.ts` が `expenseEntries` と `receipts` を
統合して以下を算出する。

- 合計支出
- カテゴリ別合計
- 支出件数
- 前週比

**集計互換ルール（`lib/convex/receipts/spendingEntries.ts`）:**

- 対象期間（週・日・月）内に **1 件でも** `expenseEntries` が存在する場合、当該期間の `receipts` を
  集計対象から **すべて除外** する（二重計上防止）
- `expenseEntries` が存在しない期間は `receipts` を従来どおり集計する

集計は Convex query で行う。

`receipts.type: "income"` はschema互換として残す。新規収入は `expenseEntries.entryType: "income"` へ保存する。
週次サマリーとダッシュボードでは `getWeekIncomeEntries` で収入を別途集計し、支出集計や純支出計算には含めない。

**週別支出推移（対象週を含む直近3週間）:**

- 既存の `getFourWeeksSummary` queryで対象週を含む4週間の支出合計とカテゴリ別内訳を取得する
- 新しい3週間を `@mui/x-charts` の積み上げ `BarChart` で表示する
- 最古の1週間は、表示週の前週差と直前2週間平均との差を計算するためだけに使う
- 対象週自身は平均へ含めず、直前2週間の算術平均と比較する
- Tooltipには週範囲、支出合計、カテゴリ内訳を表示する
- 表示カテゴリは金額上位5件 + 残りを「その他」に集約する
- schema、認可、保存処理は変更しない
- 空状態: 「週別の支出データがあると表示されます」

### 12.3 入力補助

- 直前入力の日付とカテゴリを次の入力の初期値に使う
- 過去の `shopName` から候補を出す
- 店名とカテゴリの過去組み合わせから、カテゴリ候補を推定する

### 12.4 レシート税情報の正規化

AI 画像解析では印字事実を抽出し、`lib/domain/receipt/tax/interpretReceiptTax.ts` で税率別集計との整合性から税コンテキストを解決・正規化する。

- 外税・内税・混在を `amountBasis` と `taxSummaries` に分離する
- 登録額は `normalizedAmountYen` を正本とし、未設定時は `amountYen` にフォールバックする
- 税額集計行は明細として登録しない
- マーカーは印字文字列とレシート内の凡例を補助証拠として扱い、単独では税率を確定しない
- 一意に解決できない税率・税込税抜区分は未解決のまま確認対象にする
- 警告コード（`unresolved_tax_rate:items[i]`, `unresolved_amount_basis:items[i]`, `taxable_amount_mismatch`, `missing_tax_items` 等）は下書き・明細の `warnings` に保存し、UI では `src/features/receipt-review/utils/taxWarnings.ts` で日本語化する

## 13. CSVエクスポート設計

CSVは指定週または全期間の支出を対象に生成する将来拡張とする。現行コードでは `/export` 画面、
CSV生成関数、CSVダウンロード処理はいずれも未実装である。

出力列:

- 日付
- 店名
- 金額
- カテゴリ
- メモ
- 週開始日
- 週終了日

表計算ソフトで扱いやすいよう、UTF-8 BOM付きCSVを第一候補にする。

店名やメモなどのユーザー入力値が以下の文字で始まる場合、CSV出力時にエスケープする。

- `=`
- `+`
- `-`
- `@`

## 14. レシート画像入力PoC設計

初回PoCでは、ブラウザで選択したレシート画像をクライアント側でリサイズし、Convex Action から OpenAI Vision 対応 API へ送信して `shopName` / `date` / `amountYen` の候補を返す。

### 14.1 プライバシーと保存方針

- 画像を外部APIへ送信する前に、初回同意ダイアログでユーザー確認を行う。
- 同意が保存されていない場合は、Convex Action を呼ばず、画像データも送信しない。
- 画像は Convex Storage や `receipts` テーブルへ保存しない。
- 抽出結果はフォーム候補であり、自動保存しない。
- ユーザーが `保存して次へ` を押した時点で、既存の `receipts.createReceipt` を使って通常の receipt として保存する。

### 14.2 失敗時と拒否時

- 同意拒否時は画像送信を行わず、同じレシート入力フォームで手入力に戻す。
- 抽出失敗時はエラーと手入力可能な案内を表示し、入力済みフォーム値を壊さない。
- 開発、Preview、CI では `RECEIPT_IMAGE_EXTRACTOR_MODE=mock` を使い、通常検証で実 OpenAI API を呼ばない。

## 15. ホスティング

Vite SPAはVercelで配信する。

独自ドメインは初期MVPでは使わず、Vercelが提供する `*.vercel.app` URLを使う。

DEV/PreviewはVercel Preview DeploymentのURLを使い、PRODはVercel Production DeploymentのURLを使う。

将来、独自ドメインやCloudflare Workers固有の処理が必要になった場合に、ドメイン移行やHono追加を検討する。

## 16. 環境設計

DEV / PREVIEW / PROD の3環境を分けて構築する。

| 領域           | DEV                                              | PREVIEW                                          | PROD                                              |
| -------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------- |
| フロントエンド | Vercel Preview URL、またはlocalhost              | `preview` branch の Vercel Preview              | Vercel Production URL                             |
| URL            | `https://kakeibo-*.vercel.app` などのPreview URL | `https://kakeibo-*.vercel.app` などのPreview URL | `https://kakeibo.vercel.app` などのProduction URL |
| Clerk          | Development instance                             | Development instance                             | Production instance                               |
| Clerk認証方式  | Google OAuth                                     | Google OAuth                                     | Google OAuth                                      |
| Convex         | dev deployment                                   | fixed staging deployment                         | production deployment                             |
| データ         | テストデータ                                     | 統合確認・PROD候補確認用の代表データ             | 実ユーザーデータ                                  |
| 環境変数       | `.env.local`、Vercel Preview env                 | GitHub Environment `Preview`、Vercel Preview env、Convex staging env | GitHub Environment `production`、Vercel Production env、Convex Production env |

### 16.1 環境分離方針

- DEV/PREVIEWとPRODでClerk instanceを分ける
- DEV/PREVIEW/PRODでConvex deploymentを分ける
- PREVIEWはPR単位の通常Previewと区別し、`preview` branchの統合確認とPROD候補確認として扱う
- DEVのGoogle OAuth callback URLに本番URLを入れない
- PRODのGoogle OAuth callback URLにローカルURLを入れない
- PREVIEWではClerk Development instanceを使い、Clerk Production instanceをPreview URLで使わない
- DEVデータをPRODへ手動投入しない
- PREVIEWデータをPRODへ手動投入しない
- PRODの環境変数をローカル開発に流用しない
- PROD反映は `production-release.yml` から手動承認後に実行し、Actions以外を正規ルートにしない

### 16.2 必要な環境変数

フロントエンド:

```text
VITE_CLERK_PUBLISHABLE_KEY=
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
```

Convex:

```text
CONVEX_DEPLOYMENT=
CLERK_JWT_ISSUER_DOMAIN=
```

`CLERK_JWT_ISSUER_DOMAIN` は、DEV/PREVIEW/PRODそれぞれのClerk Frontend API URLに合わせる。

ローカルではClerk CLIとConvex CLIにより `.env.local` が生成される。`.env.local`、`.vercel/`、`.agents/`、`.pnpm-store/`、`.npmrc` はGit管理外にする。

VercelにはPreview / Productionの環境変数を分けて登録する。Production secretをローカル開発へ流用しない。

### 16.3 デプロイ方針

- PRまたは開発ブランチをDEV/PR Previewに紐づける
- `preview` branch への push は `preview-deploy.yml` からPREVIEWへ自動デプロイする
- PROD反映は `production-release.yml` から、PREVIEWで検証した同じ commit / ref をProductionへ再デプロイする
- PROD反映は GitHub Environment `production` の承認後に、Convex Production、Vercel Production、PROD smoke checklist の順で実行する
- schema変更はまずDEV Convex deploymentで確認する
- schema変更を含むリリース候補はPREVIEW Convex deploymentで代表データを使って確認する
- Clerk設定変更もまずDEVで確認する
- PROD反映前に、Googleログイン、主要CRUD、週次サマリー、設定保存を確認する

### 16.4 データ移行方針

MVPでは自動migrationを最小限にする。Convex schema変更時は、以下を確認する。

- 既存PRODデータが読めなくならないか
- 必須項目追加で既存データが壊れないか
- query/mutationの認可条件が維持されているか

## 17. テスト方針

### 17.1 Unit test

- 週開始日、週終了日の計算
- Valibot schema
- 金額バリデーション
- カテゴリ別集計
- 前週比計算
- CSV生成（将来実装時）
- CSVインジェクション対策（将来実装時）

### 17.2 Component test

- レシート入力フォーム
- カテゴリ選択
- 週次サマリー表示

### 17.3 Convex function test

- 未認証時にquery/mutationが拒否される
- 他グループのデータが取得・更新できない
- 初期カテゴリseed
- 週次セッション作成と再開
- レシート作成、更新、削除
- レシート画像外部API送信の同意状態取得と承認保存
- AI支出下書きの状態・確認理由・`receipts.shopName` 変換方針
- AI支出下書きと明細のグループ境界確認、登録済み下書きの重複登録防止

### 17.4 E2E test

主要フロー:

1. ClerkでGoogleログインする
2. 今週の入力を開始する
3. 支出と収入を複数件入力する
4. ダッシュボードで集計を確認する
5. 設定画面でカテゴリと週の曜日設定を確認する
6. 必要に応じてレシート画像補助やAI支出下書きキューを確認する

スマートフォン幅でも同じ主要フローが完了できることを確認する。

## 18. 実装タスク分解

1. Vite + React + TypeScriptの初期構築（完了）
2. Clerk CLI、Convex CLI、Vercel CLI/MCP、Convex MCP、Chrome DevTools MCPの初期接続（完了）
3. Vercel projectとGitHub repositoryの連携（完了）
4. Convex AI filesの追加（完了）
5. MUI theme、Tailwind CSS、基本レイアウトの整備（完了）
6. Clerk導入とGoogle OAuth設定（完了）
7. Convex導入（完了）
8. Clerk + Convex連携（完了）
9. DEV/PROD環境変数とClerk issuer設定（完了）
10. Convex schemaとindex定義（完了）
11. 認証ユーザー取得とuser初期化（完了）
12. 初期カテゴリseed（完了）
13. 週開始日、週終了日のdate utility（完了）
14. 支出入力（`expenseEntries`）、編集、削除（完了）
15. 週次セッション作成、再開（完了）
16. ダッシュボード集計（完了）
17. 週次振り返りメモ（既存データ互換のみ、UIなし）（完了）
18. カテゴリ管理（完了）
19. グループ管理・招待（完了）
20. AI支出下書きキュー（完了）
21. `sourceDocuments` / `expenseEntries` schema（M18 #177）（完了）
22. Unit testとComponent test（継続）
23. Convex function test（継続）
24. E2E test（継続）
25. レスポンシブ確認（継続）

現行コードで未実装または未反映の項目:

- CSVエクスポート画面とCSV生成処理
- 月収入設定UI

収入入力 UI は `ExpenseEntryForm` の `entryType` 切り替えで実装済み。

旧タスクリスト上の `Unit testとComponent test` 以降は、変更内容に応じて継続的に追加・更新する。

## 19. リスクとトレードオフ

| リスク             | 内容                                | 対策                                                            |
| ------------------ | ----------------------------------- | --------------------------------------------------------------- |
| ベンダー依存       | ConvexのDB/Functionsに依存する      | データモデルを単純に保ち、CSV/JSONエクスポートを用意する        |
| SQL分析がしづらい  | Postgresほど自由なSQL分析ができない | MVPでは不要。必要になれば外部分析基盤へのexportを検討する       |
| オフライン入力なし | 通信不安定時に入力できない          | MVPではエラー表示と再試行を優先し、将来オフライン対応を検討する |
| 認可漏れ           | 他グループのデータが見えると致命的  | 全query/mutationで `groupMembers` と `groupId` を必ず確認し、テストする |
| Hono追加時の複雑化 | API層が増えて責務が曖昧になる       | Convexで足りない要件が出るまで追加しない                        |
| 環境混在           | DEVのClerkやConvexがPRODに混ざる    | Clerk application、Convex deployment、環境変数を明確に分離する  |

## 20. 実装前に決めたこと

- MUIは標準Material Design感を抑えた独自テーマにする
- Tailwind CSSはレイアウト用途に限定して採用する
- CSVエクスポートは現行コードでは未実装であり、実装時にクライアント生成またはConvex側生成を再確認する
- オフライン入力はMVPでは扱わない
- 初期デプロイ先はVercelにする
- 独自ドメインは使わず、DEV/PRODともに `*.vercel.app` のURLを使う

## 21. M18. 支出項目モデル再設計

M18では、既存MVP利用者向けに、家計簿の中心を `receipts` から `expenseEntries` に寄せ、レシートや払込票などの入力元を `sourceDocuments` として分離する。`inputSources` は説明用の言い換えとして扱う。

### 21.1 用語の役割

- `sourceDocuments`
  - schema 上の正本名とする
  - レシート、払込票、手入力、AI下書きなどの入力元を表す
  - いつ、どの経路で、何から入力したかを保持する
- `inputSources`
  - 説明文やUIで使う言い換えとして扱う
  - 意味は `sourceDocuments` と同じ
- `expenseEntries`
  - カテゴリ別支出項目を表す
  - 週次集計、カテゴリ別集計、振り返りの正本になる
  - 1つの入力元から複数件の支出項目を作れる前提を持つ

### 21.2 互換と移行

- `receipts` は互換層として残す
- 手入力・AI 登録の正本は `expenseEntries` である
- `sourceDocuments`、`expenseEntries`、`receiptAnalysisBatches`、`receiptAnalysisImageJobs` の schema は **実装済み**
- 移行期間の集計は `lib/convex/receipts/spendingEntries.ts` が担当する。対象期間（週・日・月）内に
  **1 件でも** `expenseEntries` がある場合、当該期間の `receipts` を集計から **すべて除外** して二重計上を防ぐ
- `expenseEntries` が存在しない期間は `receipts` を従来どおり集計する

### 21.3 M18の実装順

| Issue | 内容 | 状態 |
| --- | --- | --- |
| #177 | `sourceDocuments` / `expenseEntries` の schema 設計 | 完了 |
| #180 | 既存 `receipts` との互換・移行方針（`lib/convex/receipts/spendingEntries.ts`） | 完了 |
| #178 | カテゴリ別集計の `expenseEntries` 化 | 完了（`lib/convex/receipts/spendingEntries.ts`） |
| #181 | 入力元から複数のカテゴリ別支出項目を作るUI（`ExpenseEntryForm`） | 完了 |
| #173 | レシート画像認識時のカテゴリ自動判定 | 未着手 |
| #179 | AI下書きからカテゴリ別支出項目候補を作成 | 完了（`registerReadyDraftsAsExpenseEntries`） |
| #175 | 登録済みカード表示改善 | 未着手 |
| #102 | 受け入れ確認 | 継続 |

### 21.4 主要 mutation / query 方針

- `sourceDocuments` は schema 上の正本だが、**公開 CRUD API は未実装**。現行の手入力・AI 登録は `expenseEntries` と `aiExpenseDrafts` を直接使う。
- `expenseEntries` は家計簿集計の正本として CRUD する。
- 手入力では `sourceDocumentId` なしの `expenseEntries` を許容する。
- AI 登録では `aiExpenseDraftId` で下書きと支出項目を紐づける。
- 1つの `sourceDocuments` から 0 件以上の `expenseEntries` を作れる設計だが、現行フローでは未使用。
- 既存 `receipts` の query / mutation は当面の互換層として残す。
- 所有境界は `ctx.auth.getUserIdentity()`、`groupMembers`、`users.activeGroupId` から解決した `groupId` を基準に統一する。

### 21.5 schema 案

#### sourceDocuments

入力元の原本を表す。手入力・レシート・払込票・AI 下書きの共通入口にする。**schema のみ実装済み。公開 API は未実装。**

- `groupId`: `Id<"groups">`
- `sourceType`: `manual` / `receipt` / `convenience_payment` / `invoice` / `unknown`
- `status`: `draft` / `ready` / `finalized`
- `date`: `string` optional
- `totalAmount`: `number` optional
- `shopName`: `string` optional
- `paymentPlace`: `string` optional
- `payeeName`: `string` optional
- `paymentPurpose`: `string` optional
- `imageStorageId`: `Id<"_storage">` optional
- `createdAt`: `number`
- `updatedAt`: `number`

#### expenseEntries

カテゴリ別支出項目を表す。週次集計・カテゴリ集計・一覧表示の正本にする。

- `groupId`: `Id<"groups">`
- `sourceDocumentId`: `Id<"sourceDocuments">` optional
- `aiExpenseDraftId`: `Id<"aiExpenseDrafts">` optional
- `date`: `string`
- `amount`: `number`
- `categoryId`: `Id<"categories">` optional（支出では実質必須。収入は未設定）
- `title`: `string`
- `memo`: `string` optional
- `entryType`: `expense` / `income`
- `source`: `manual` / `ai_suggested` / `imported`
- `createdAt`: `number`
- `updatedAt`: `number`

#### `sourceDocumentId` の扱い

- 手入力で支出項目だけ作る場合は `sourceDocumentId` を入れない。
- 画像・払込票・AI 下書き由来の項目は、対応する `sourceDocuments` がある場合のみ `sourceDocumentId` を入れる。
- 1つの `sourceDocuments` に対して `expenseEntries` が 0 件のまま残るのは、下書き保存または一時保留として許容する。
- `sourceDocuments.status = finalized` は、少なくとも 1 件の `expenseEntries` が紐付いた状態を基本とする。

### 21.6 index 案

- `sourceDocuments`
  - `by_group_id_and_status_and_created_at`
  - `by_group_id_and_date`
- `expenseEntries`
  - `by_group_id_and_date`
  - `by_group_id_and_category_id_and_date`
  - `by_group_id_and_source_document_id`
  - `by_group_id_and_ai_expense_draft_id`
- `managementAuditLogs`
  - `by_group_id_and_created_at`

### 21.7 互換境界

- `receipts` は互換層として維持する。手入力・AI 登録は `expenseEntries` を正本とする。
- 集計の正本ロジックは `lib/convex/receipts/spendingEntries.ts` に集約する。`convex/receipts/spendingEntries.ts` は `lib/convex/receipts/spendingEntries.ts` への re-export ラッパーとして残す。
- M18 の後続 Issue は `expenseEntries` を正本として扱える。

## 22. N2. P1 LINE連携基盤

### 22.1 LINE channelとuserIdの境界

LINE Login channelとMessaging API channelは、同じ環境内で同一LINE Providerに所属させる。同一Provider配下では、LINE Login callbackで取得したuserIdとMessaging API WebhookのuserIdを同一の連携キーとして扱える。Development、Preview、Productionはそれぞれ別Provider・別channel・別secretを使い、環境をまたいだuserIdや設定を共有しない。

LINE連携はClerkのWeb認証を置き換えず、Clerkの`identity.tokenIdentifier`に紐づく外部連携として実装する。LINE userIdをクライアント引数の認可キーとして信用せず、サーバー側で有効な連携レコードからkakeibo userIdを解決する。

### 22.2 OAuth 2.1 + PKCE連携

1. 認証済みユーザーがWeb設定画面から連携開始を要求する。
2. サーバーが短命な一回限りのstate、nonce、PKCE verifierを生成し、ユーザー識別子と有効期限を保存する。クライアントへは認可URLとchallengeだけを返す。
3. LINE Loginへリダイレクトし、callbackではraw queryのcode/stateを受け取る。
4. stateを原子的に予約して再利用を拒否し、LINE token endpointへcode、redirect URI、verifierを送る。
5. ID tokenのnonce、audience、issuer、有効期限を検証し、取得したLINE userIdを有効な連携として保存する。
6. callbackは秘密値を返さず、成功・失敗の結果コードだけをWeb設定画面へリダイレクトする。

連携解除はClerk認証済みユーザーからのみ実行でき、解除済みレコードはWebhookから解決できない。再連携時は同じkakeiboユーザーまたは同じLINE userIdに残る旧activeレコードを原子的に失効させる。

### 22.3 Webhook受信と非同期処理

Convex HTTP Actionの`/webhooks/line`で、JSON変換前のraw bodyと`x-line-signature`をHMAC-SHA256で検証する。署名不一致、署名欠落、payload不正は処理せず、検証済みイベントだけを内部mutationでclaimする。

`webhookEventId`を冪等キーとして保存し、再送イベントは返信・後続処理を重複させない。text、image、postback、follow、unfollowを型付きイベントとして分類し、activeな連携のtextイベントは読み取り専用サマリーdispatcherへ、imageイベントは画像intake dispatcherへ渡す。未連携ユーザーへは家計データを返さず、必要な案内返信だけをLINE clientへ渡す。画像本体はWebhook行にも下書きにも保存しない。

payload全文、署名、reply token、LINE userId、家計データをログや監査記録へ保存しない。テストコードと CI ジョブ内の疑似Webhookは mock client を使い、実 LINE API に依存しない。共有する DEV / Preview Convex で人間が `LINE_INTEGRATION_MODE=real` を入れた場合、CI はその値を維持するため、その deployment からは実 LINE API を呼びうる。

### 22.4 LINE読み取り専用サマリー

連携済みユーザーのtextメッセージは、claimと原子的に内部actionを予約し、`replyToken`はジョブ引数としてだけ渡す。サマリー生成はClerk公開queryを使わず、activeな`lineAccountLinks`から解決したkakeibo `userId`と、Webと同じactiveグループ解決で内部queryする。

返信は読み取り専用で、今週の支出合計、今週の収入合計、カテゴリ別支出、直近3週間の支出推移をテキストで返す。グループ内のカテゴリ名と一致するメッセージ、または文中から抽出したカテゴリ候補がそのカテゴリの今週支出だけを返す。完全一致コマンドに加え、代表的な言い回しはルールベースで同じintentへ正規化する。未知のテキストはカテゴリ検索へ落とさず使い方案内のみ返す。グループ文書が無い所属、または削除済みグループでは家計金額を返さない。データがない場合は専用の空メッセージを返す。支出・収入の登録、更新、削除、個別レシート全文は返さない。

### 22.5 LINE channel default Rich Menu とクイックリプライ

Messaging API channel の default Rich Menu は、既存の読み取り専用テキストコマンドをタップで送るための channel 設置物である。セル定義の正本は `lib/domain/lineSummary/richMenu.ts` とし、画像は `docs/line/rich-menu-readonly-summary.png` を使う。

- サイズは full size の 2500x1686、2行3列、chat bar は「家計簿」
- セルは「今週の家計」「支出」「収入」「カテゴリ別」「週別推移」「使い方」の6つ。各セルの action は `message` のみとし、送信テキストは現行の `parseLineSummaryCommand` が解釈できる語句に固定する
- リッチメニューセルに postback、URI、per-user Rich Menu、画像送信・登録操作は置かない
- レシート送信案内と Web 導線は、ヘルプ文面とサマリー返信のクイックリプライで出す。Web URI は `APP_BASE_URL` の `/weeks/current/input` に限定する
- 未連携ユーザーの返信には家計操作のクイックリプライを付けない。channel default メニューは見えるが、返信は連携案内だけとし家計金額は出さない
- 連携済みユーザーのタップは現行どおり text イベントとしてサマリー dispatcher へ入る
- 実行時アプリは Rich Menu を自動作成・自動適用しない。設置は `pnpm run line:rich-menu -- --apply` を人間が非Productionで実行する。Production への適用は別途人間承認とする。CI と mock mode では LINE API を呼ばない。
- リッチメニュー画像と rich menu ID は secret ではない。channel access token は secret のまま扱う。

### 22.6 LINE画像intakeとAI下書き

連携済みユーザーが1:1で送ったレシート画像は、`messageId` をキーに Messaging API の content 取得を内部actionで行う。取得バイナリはaction内の一時値だけとし、`lineWebhookEvents` / `lineImageJobs` / `aiExpenseDrafts` / Convex Storage へ画像本体を保存しない。`lineImageJobs` は `webhookEventId`、kakeibo `userId`、`messageId`、処理状態、任意の `skipReason` / `draftId` だけを持つ。

- 認可は unique な active `lineAccountLinks` から解決した kakeibo `userId` を使い、LINE userId を認可キーにしない。Clerk は webhook HTTP action に載せない。
- 未連携、複数active linkの不整合、グループ未所属、activeグループ未解決では下書きを作らず、家計金額も返さない。未所属・未解決の返信文は読み取り専用サマリーと同じ文言を使う。
- OpenAI へ送る前に、既存Webと同じ `users.receiptImageExternalApiConsentAcceptedAt` を確認する。LINE画像送信そのものを同意とは扱わない。同意UIはLINE側に作らない。
- 抽出と下書き作成は Web と同じ `extractReceiptFieldsFromImage` と `classifyCreatedDraft()` を使う。画像作成直後は `user_confirmation_required` により常に `needs_review` とする。`expenseEntries` / `receipts` への自動登録はしない。
- 返信は Messaging API の reply のみとし、Push は使わない。確認導線は `APP_BASE_URL` の `/weeks/current/input` へ誘導する。返信文に家計金額を含めない。
- 過大または非対応画像はリサイズせずスキップして失敗返信する。解析失敗時は Web と同じ failed 下書きを残す。
- Development / Preview / CI の未設定時は `LINE_INTEGRATION_MODE=mock` と `RECEIPT_IMAGE_EXTRACTOR_MODE=mock` を既定にする。preview-deploy と e2e は既存の `LINE_INTEGRATION_MODE=real` を上書きしない。`real` のときは共有 DEV / Preview deployment から実 LINE API を呼びうる。テストコード自体は mock client のまま実 LINE に依存しない。
