# システム管理者の認可・付与・剥奪設計

> **重要: 本ドキュメントは認可モデルの正本です。Issue #474で`systemAdmins`、
> `requireSystemAdmin`、専用監査・通知キューのConvex基盤を実装済みです。管理 UI（`/admin`）と
> 検索・詳細API、ユーザー・グループ管理操作も後続Issueで実装済みです。**

このドキュメントは、Suzumemo 全体を運用するシステム管理者の認可モデル、初期登録、
付与・剥奪、監査、家計データとの境界を定義する正本である。

- 親 Issue: [#282 システム管理者機能を実装する（MVP親Issue）](https://github.com/hondasports/kakeibo/issues/282)
- 設計 Issue: [#288 システム管理者の認可モデルと付与・剥奪手順を設計する](https://github.com/hondasports/kakeibo/issues/288)
- 前提方針: [#227 システム管理者機能のMVP境界と管理権限を定義する](https://github.com/hondasports/kakeibo/issues/227)

後続 Issue #289〜#292 は、このドキュメントを前提に実装済みである。

## 1. 目的とスコープ

- システム管理者権限を `groupMembers.role` から分離する
- Clerk は本人認証にだけ使い、管理者権限の正本にしない
- 管理情報の運用権限と、家計データの利用権限を分離する
- 誤昇格、自己操作、最後の管理者喪失、環境間の権限混在を防ぐ
- 付与・剥奪を追跡可能な監査証跡として残す

schema、Convex function、管理 UI、E2Eの責務はIssueごとに分割する。#474ではschema、共通認可、
付与・剥奪・bootstrap/recover、専用監査と通知キューを実装し、管理UI・検索・詳細・E2Eは
#289〜#292で実装した。

## 2. 用語と権限モデル

| 用語 | 意味 |
| --- | --- |
| システム管理者 | Suzumemo 全体の管理情報を運用する担当者 |
| グループ `owner` | 自分が所属するグループの日常管理を行う利用者 |
| active admin | `systemAdmins.status === "active"` のレコードを持つ認証済みユーザー |
| revoked admin | 過去に管理者だったが、現在は管理 API を実行できないユーザー |
| bootstrap | 各環境で最初のシステム管理者を server-only の管理操作により登録すること |

MVP のシステム管理者ロールは `admin` だけとする。`support` などのロール列は持たず、
権限判定は active admin かどうかの一段階に限定する。読み取り専用ロールが必要になった場合は、
利用シナリオと権限マトリクスを別 Issue で定義してから追加する。

メールアドレス、メールドメイン、Clerk metadata、JWT の独自 claim、クライアントのフラグを
管理者昇格の根拠にしてはいけない。

## 3. データモデル

### 3.1 `systemAdmins`

```ts
systemAdmins: defineTable({
  userId: v.id("users"),
  status: v.union(v.literal("active"), v.literal("revoked")),
  createdAt: v.number(),
  updatedAt: v.number(),
  grantedAt: v.number(),
  grantedByUserId: v.optional(v.id("users")),
  grantReason: v.string(),
  revokedAt: v.optional(v.number()),
  revokedByUserId: v.optional(v.id("users")),
  revokeReason: v.optional(v.string()),
})
  .index("by_user_id", ["userId"])
  .index("by_status", ["status"])
```

設計上の不変条件:

- 1ユーザーにつき最大1レコード。`by_user_id` を `.unique()` で読み、重複時は fail closed にする
- `active` は `revokedAt`、`revokedByUserId`、`revokeReason` を持たない
- `revoked` は上記3項目をすべて持つ
- 再付与では既存レコードを `active` に戻し、`grantedAt`、`grantedByUserId`、`grantReason` を更新する
- `createdAt` はレコードの初回作成日時、`updatedAt` は最後の状態変更日時とする
- `role` と環境名の列は持たない。環境分離は Convex deployment のデータ境界で行う

### 3.2 `systemAdminAuditLogs`

グループ向けの既存 `managementAuditLogs` は `groupId` を必須とし、グループ owner の閲覧境界に
属するため、システム管理者監査には流用しない。専用の `systemAdminAuditLogs` を使用する。

```ts
systemAdminAuditLogs: defineTable({
  // action の値集合は SYSTEM_ADMIN_AUDIT_ACTIONS（lib/domain/systemAdmin/auditLog.ts）が正本
  action: systemAdminAuditActionValidator,
  actorType: v.union(v.literal("system"), v.literal("system_admin")),
  actorUserId: v.optional(v.id("users")),
  targetKind: v.union(
    v.literal("system_admin"),
    v.literal("user"),
    v.literal("group"),
    v.literal("invitation"),
    v.literal("notification_setting"),
  ),
  targetUserId: v.optional(v.id("users")),
  targetDisplayNameSnapshot: v.optional(v.string()),
  sourceUserId: v.optional(v.id("users")),
  sourceUserDisplayNameSnapshot: v.optional(v.string()),
  targetId: v.optional(v.string()),
  reason: v.optional(v.string()),
  queryType: v.optional(v.string()),
  queryHash: v.optional(v.string()),
  resultCount: v.optional(v.number()),
  previousStatus: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
  newStatus: v.optional(v.union(v.literal("active"), v.literal("revoked"))),
  sourceGroupId: v.optional(v.id("groups")),
  sourceGroupNameSnapshot: v.optional(v.string()),
  targetGroupId: v.optional(v.id("groups")),
  targetGroupNameSnapshot: v.optional(v.string()),
  beforeMembershipStatus: v.optional(
    v.union(...GROUP_MEMBERSHIP_STATUSES.map((value) => v.literal(value))),
  ),
  afterMembershipStatus: v.optional(
    v.union(...GROUP_MEMBERSHIP_STATUSES.map((value) => v.literal(value))),
  ),
  beforeActiveGroupId: v.optional(v.id("groups")),
  afterActiveGroupId: v.optional(v.id("groups")),
  beforeOwnerCount: v.optional(v.number()),
  afterOwnerCount: v.optional(v.number()),
  beforeNotificationEnabled: v.optional(v.boolean()),
  afterNotificationEnabled: v.optional(v.boolean()),
  result: v.optional(v.union(v.literal("success"), v.literal("denied"))),
  createdAt: v.number(),
})
  .index("by_source_group_id_and_target_user_id_and_action_and_result", [
    "sourceGroupId",
    "targetUserId",
    "action",
    "result",
  ])
  .index("by_created_at", ["createdAt"])
  .index("by_action_and_created_at", ["action", "createdAt"])
  .index("by_actor_user_id_and_created_at", ["actorUserId", "createdAt"])
  .index("by_target_user_id_and_created_at", ["targetUserId", "createdAt"])
  .index("by_action_and_actor_user_id_and_created_at", ["action", "actorUserId", "createdAt"])
  .index("by_action_and_target_user_id_and_created_at", ["action", "targetUserId", "createdAt"])
  .index("by_actor_user_id_and_target_user_id_and_created_at", [
    "actorUserId",
    "targetUserId",
    "createdAt",
  ])
  .index("by_action_and_actor_user_id_and_target_user_id_and_created_at", [
    "action",
    "actorUserId",
    "targetUserId",
    "createdAt",
  ])
  .index("by_target_kind_and_target_id_and_created_at", ["targetKind", "targetId", "createdAt"])
```

検索・閲覧のactionと最小metadata（検索種別、検索語hash、結果件数）は#289で追加済み。
監査ログにはJWT、秘密情報、検索語の平文、金額、店名、メモ、レシート画像、AI解析結果などを保存しない。

### 3.3 `systemAdminNotifications`

システム管理者向けの操作通知を管理する。`convex/email` 経由でトランザクションメールをenqueueする。

```ts
systemAdminNotifications: defineTable({
  action: v.union(
    v.literal("system_admin_granted"),
    v.literal("system_admin_revoked"),
    v.literal("system_admin_recovered"),
    v.literal("system_admin_bootstrapped"),
    v.literal("system_admin_membership_changed"),
    v.literal("system_admin_ownerless_group_recovered"),
    v.literal("system_admin_group_invitation_revoked"),
  ),
  recipientUserId: v.optional(v.id("users")),
  recipientEmail: v.optional(v.string()),
  targetUserId: v.optional(v.id("users")),
  targetEmailSnapshot: v.optional(v.string()),
  dedupeKey: v.string(),
  payloadJson: v.string(),
  createdAt: v.number(),
})
  .index("by_dedupe_key", ["dedupeKey"])
  .index("by_recipient_and_created_at", ["recipientUserId", "createdAt"])
  .index("by_recipient_and_target_user_id_and_created_at", [
    "recipientUserId",
    "targetUserId",
    "createdAt",
  ])
```

## 4. 共通認可関数

すべての管理 query / mutation は入口で `requireSystemAdmin(ctx)` を呼ぶ。

1. `ctx.auth.getUserIdentity()` で認証を確認する
2. `identity.tokenIdentifier` から `users` を解決する
3. `systemAdmins.by_user_id` を `.unique()` で取得する
4. レコードが1件だけ存在し、`status === "active"` であることを確認する
5. いずれかを満たさなければ、管理情報を読む前に拒否する

クライアントから渡された `userId`、`role`、`isAdmin` を認可判断に使わない。未認証、ユーザー未作成、
管理者レコードなし、重複レコード、`revoked`、DBエラーのいずれも許可へ倒さず fail closed にする。

`requireSystemAdmin` は管理 API 専用であり、既存の家計 API やグループ管理 API の
`requireGroupMembership` / `requireGroupOwner` を迂回する用途に使ってはいけない。

## 5. 初期管理者の登録（bootstrap）

初期管理者は各 Convex deployment で個別に登録する。通常 UI、public query / mutation / action、
Clerk metadata、自動メール判定から bootstrap してはいけない。

`bootstrapSystemAdmin` は `internalMutation` として実装し、public function から呼ぶ wrapper は作らない。
対象deploymentの管理権限を持つ担当者が、次の形式で明示的に実行する。

```bash
pnpm exec convex run internal.systemAdmins.bootstrapSystemAdmin \
  '{"targetUserId":"<users._id>","reason":"<登録理由>","expectedEnvironment":"<development|preview|production>"}' \
  --deployment <exact-deployment-name>
```

`--prod` のような短縮指定ではなく deployment 名を指定し、mutation 内でも `expectedEnvironment` と
`APP_ENV` の完全一致を検証する。不一致、`APP_ENV` 未設定、未知の値では書き込み前に拒否する。

手順:

1. 対象環境と `APP_ENV` が一致することを二者確認する
2. 対象者がその環境の `users` に存在することを確認する
3. Convex Dashboard または認証済み CLI の管理チャネルから、server-only の bootstrap operation を実行する
4. operation 内の同一 mutation で `systemAdmins` の active レコードと
   `system_admin_bootstrapped` 監査ログを作成する
5. active admin が1人、対応する監査ログが1件だけ存在することを確認する
6. 管理画面の環境表示と対象環境が一致することを確認する

bootstrap operation は次を満たす。

- 対象は既存 `users._id`、理由は空白除去後1〜500文字
- active admin が既に1人でも存在する場合は拒否する
- `grantedByUserId` / `actorUserId` は未設定、`actorType` は `system`
- 再実行で重複レコードを作らず、失敗時は監査ログだけを残さない

Production の管理者IDやseedファイルを Preview / Developmentへコピーしない。bootstrap 用の一時入力は
コミットせず、実行後にローカルから破棄する。

### 5.1 緊急復旧

最後の管理者保護が正しく動く通常系では active admin が0人になることはない。データ破損や誤った
管理操作により0人になった場合だけ、bootstrap と同じ server-only の管理チャネルから復旧する。

1. active admin が0人であることと、通常の付与 mutation を実行できないことを確認する
2. 対象環境、復旧対象者、理由を2人で確認し、Production は運用責任者の承認を記録する
3. `internalMutation` の `recoverSystemAdmin` を `internal.systemAdmins.recoverSystemAdmin` として
   `--deployment <exact-deployment-name>` 付きで実行し、既存レコードを再有効化するか、未登録なら作成する
4. 同一 mutation で `system_admin_recovered` 監査ログを作成する
5. active admin、対象レコード、監査ログ、環境表示を再確認する

active admin が1人でも存在する場合、復旧 operation は拒否する。通常 UI、恒久的な public endpoint、
メールやClerk metadataによる自動復旧は用意しない。復旧後は原因と再発防止を別 Issue に記録する。

## 6. 2人目以降の付与

`grantSystemAdmin({ targetUserId, reason })` 相当の public mutation を提供し、次を同一トランザクションで行う。

1. `requireSystemAdmin` で操作者を確認する
2. 理由を空白除去し、1〜500文字であることを確認する
3. 対象 `users` の存在と、操作者と対象者が異なることを確認する
4. `systemAdmins.by_user_id` を `.unique()` で取得する
5. 未登録なら作成、`revoked` なら同じレコードを再有効化、active なら業務エラーにする
6. `system_admin_granted` 監査ログを作成する

自己付与と自己承認は禁止する。MVPでは別の承認待ち状態を設けず、別の active admin が実行した
mutation 自体を付与判断とする。付与と監査ログの一方だけが成功する状態を許可しない。

## 7. 剥奪

`revokeSystemAdmin({ targetUserId, reason })` 相当の public mutation を提供し、次を同一トランザクションで行う。

1. `requireSystemAdmin` で操作者を確認する
2. 理由を空白除去し、1〜500文字であることを確認する
3. 対象が操作者本人でないことを確認する
4. 対象が active admin であることを確認する
5. `by_status` から active admin を最大2件だけ読み、最後の1人を剥奪する操作を拒否する
6. 対象を物理削除せず `revoked` に更新する
7. `system_admin_revoked` 監査ログを作成する

active admin の bounded read、対象更新、監査ログ作成を1つの mutation に置く。並行した剥奪は
Convex のトランザクション競合時の再試行後にも不変条件を再評価し、active admin が0人になる変更を拒否する。

## 8. 環境分離

- Development / Preview / Production は別の Convex deployment とデータを使う
- `systemAdmins` と `systemAdminAuditLogs` を環境間で同期・複製しない
- Development / Preview では専用テストアカウントを使い、Production の管理者アカウントをテストに流用しない
- 管理画面のヘッダーに現在の環境を常時表示する
- Production では強い警告色と環境名を表示し、確認ダイアログでも再掲する
- サーバーが返す環境情報を表示に使い、クライアントの表示フラグを認可根拠にしない
- Production の bootstrap / 緊急復旧は、Preview で手順を検証してから別の対象者・理由で実行する

## 9. 家計データとの境界

システム管理者権限は家計データの閲覧権限ではない。管理 API が読み書きできるテーブルは原則として
`users`、`groups`、`groupMembers`、`groupInvitations`、`systemAdmins`、
`systemAdminAuditLogs` に限定する。

管理 API では次を取得・返却・監査記録しない。

- 支出、収入、金額、店名、銀行名、カテゴリ内容
- メモ、振り返り、レシート画像、AI解析結果、AI下書き
- 家計集計、家計データ export

システム管理者本人が通常ユーザーとして所属するグループでは、通常の `groupMembers` 認可によって
家計機能を利用できる。この場合も system admin 権限による横断アクセスは許可しない。
管理者本人に対する管理 API での所属追加（`add`）・移動（`transfer`）・activeグループ設定（`set_active`）は拒否する。
所属解除（`remove`）とactive選択解除（`clear_active`）は本人にも許可するが、ownerの所属解除禁止は維持する。

## 10. 管理 UI の状態と危険操作

システム管理者画面は通常の `/settings` と分離し、`/admin` 配下に構築されている。
「グループ owner」と「システム管理者」を同じ文言や画面で扱わない。

| 状態 | 表示・挙動 |
| --- | --- |
| 権限確認中 | 管理コンテンツを描画せず、読込状態を表示する |
| 権限なし / revoked | 家計画面へ戻す導線付きの権限拒否画面。管理情報は表示しない |
| 一覧読込中 | 環境表示を残し、一覧領域に skeleton または進捗表示を出す |
| 空 | 検索結果が0件である旨と条件を戻す導線を表示する。active admin 全体が0件の状態を通常UIで作らない |
| エラー | 秘密情報や存在確認の詳細を出さず、再試行導線を表示する |
| 付与・剥奪中 | 二重送信を防ぎ、ダイアログの入力と確定操作を無効化する |
| 成功 | 対象、操作、監査記録済みであることを通知し、一覧を再取得する |

付与・剥奪の確認ダイアログには、対象者、操作後のstatus、現在の環境、必須の理由入力、監査ログへ
記録される旨を表示する。剥奪では復旧に別の active admin が必要であることも明示する。

## 11. テスト方針

### Convex test（#289 / #292）

- active record がある認証ユーザーだけを許可する
- 未認証、usersなし、管理者レコードなし、revoked、重複レコードを拒否する
- 自己付与、自己剥奪、空理由、長すぎる理由を拒否する
- 最後の active admin を剥奪できない
- 付与・再付与・剥奪と監査ログが同時に成立する
- 管理 query の返却値と監査ログに家計データが含まれない
- 既存の家計 API は system admin であっても通常のグループ認可を要求する

### Component / E2E（#290 / #292）

- member / owner / revoked admin に `/admin` の情報を表示しない
- active admin が管理画面へ入り、環境を識別できる
- 付与・剥奪で理由と確認を必須にし、成功後のstatusを表示する
- 権限確認、読込、空、エラー、処理中を確認する

詳細なバリデーションと境界値は Convex / component test を優先し、E2E は認証・権限と主要な危険操作導線に絞る。

## 12. 関連 Issue と実装状況

| Issue | 実装範囲 | 本ドキュメントの主な参照先 | 状態 |
| --- | --- | --- | --- |
| #474 | schema、共通認可、付与・剥奪・bootstrap/recover、専用監査・通知キュー | 3〜9, 11 | 実装済み |
| #289 | schema、共通認可、管理情報検索API、監査基盤 | 3, 4, 8, 9, 11 | 実装済み |
| #290 | `/admin` ルーティング、UIシェル、状態表示 | 8, 10, 11 | 実装済み |
| #291 | 所属・owner・activeGroupId等の管理操作 | 4, 8, 9, 11 | 実装済み |
| #292 | 権限、監査、危険操作の包括テスト | 5〜11 | 実装済み |

## 13. Issue #288 完了条件

- [x] システム管理者は `admin` のみで、`groupMembers.role` と分離されている
- [x] `systemAdmins` と専用監査ログのschema方針が定義されている
- [x] 初期管理者のserver-only登録と環境分離の手順が定義されている
- [x] active admin 不在時だけ使う緊急復旧手順が定義されている
- [x] 付与、再付与、剥奪、自己操作禁止、最後のadmin保護が定義されている
- [x] `requireSystemAdmin` のfail closed方針が定義されている
- [x] 家計データにアクセスできない境界が定義されている
- [x] UI状態と後続Issueのテスト責務が定義されている
