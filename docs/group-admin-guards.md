# グループ管理操作の共通ガードと危険操作パターン

このドキュメントは、管理機能 Phase1/Phase2 の mutation・UI 実装で共通利用する
権限ガードと危険操作の確認パターンを定義する。

境界とロール定義の正本は `docs/group-admin-permissions.md`。
本ドキュメントは **実装時のチェックリスト** を提供する。

関連 Issue: [#213](https://github.com/hondasports/kakeibo/issues/213)

## 1. Convex 側の共通部品

| 部品 | 場所 | 用途 |
| --- | --- | --- |
| エラーメッセージ定数 | `convex/groups/adminGuards.ts` `GROUP_ADMIN_ERRORS` | owner 拒否、自己操作拒否などの統一文言 |
| owner ロール検証 | `assertGroupOwnerRole` | 既知の `role` を検証 |
| active group 検証 | `assertActiveGroupScope` | 操作対象 `groupId` が active group と一致するか |
| 自己操作拒否 | `assertNotSelfOperator` | 自分自身を対象にしない |
| member のみ解除 | `assertRemovableGroupMemberRole` | owner ロールの解除を拒否 |
| 最後の owner 保護 | `assertAnotherGroupOwnerRemains` | `owner` 降格時に別の owner が残ることを bounded read で確認 |
| owner 必須ヘルパー | `convex/groups/membership.ts` `requireGroupOwner` | mutation 入口で active group + owner を要求 |

### 1.1 owner-only mutation の実装パターン

```typescript
import { requireGroupOwner } from "./groups/membership";
import { assertActiveGroupScope } from "./groups/adminGuards";

export async function exampleAdminMutationHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups"> },
) {
  const { groupId } = await requireGroupOwner(ctx);
  assertActiveGroupScope(groupId, args.groupId);
  // ... 管理操作 ...
}
```

`groupId` 引数を取らない mutation は `requireGroupOwner` だけで足りる。
active group 以外を操作できないよう、明示的な `groupId` 引数には必ず `assertActiveGroupScope` を使う。

### 1.2 action 側の owner 検証

Clerk API を呼ぶ action は DB コンテキストを持たないため、`api.groups.queries.getMyGroup` の結果に対して
`assertGroupOwnerRole(group.role)` を使う（`convex/groups/clerkInvitations.ts` `inviteMember` 参照）。

### 1.3 エラー表示方針

- サーバーは `ConvexError` に **ユーザーが次の行動を取れる日本語** を載せる
- クライアントは `src/features/auth/lib/convexError.ts` の `getConvexErrorMessage` で `Error.message` を表示する
- フォールバック文言は操作ごとに UI 側で用意し、サーバーメッセージを優先する

## 2. UI 側の危険操作パターン

| 部品 | 場所 | 用途 |
| --- | --- | --- |
| 確認ダイアログ | `src/features/group-admin/components/ConfirmDangerousActionDialog.tsx` | 不可逆・誤操作リスクのある管理操作前の確認 |
| エラー取得 | `src/features/auth/lib/convexError.ts` | mutation / action 失敗メッセージの表示 |

### 2.1 確認ダイアログが必須な操作（Phase1）

| 操作 | Issue | 確認文言の要点 |
| --- | --- | --- |
| メンバーのグループ解除 | #217 | Clerk アカウントは削除されないこと |
| pending 招待取り消し | #219 | 招待が無効になること |
| オーナー権限譲渡 | #222 | 譲渡先・譲渡後の自分の role・管理操作不可になること |
| グループ削除 | #224 | 物理削除・復旧不可・Clerk/ユーザーは削除されないこと |

軽微な変更（グループ名変更 #215）は確認ダイアログ任意。

### 2.2 UI 実装チェックリスト

セクション構成と owner/member の表示差分は `docs/group-admin-ui-layout.md` を正本とする。

- [x] `member` には管理ボタン・導線を表示しない
- [x] 危険操作は `ConfirmDangerousActionDialog` で確認してから mutation を呼ぶ
- [x] 確認中はキャンセル・確定ボタンを無効化する
- [x] 失敗時は `getConvexErrorMessage` でサーバーメッセージを表示する
- [x] 「ユーザー削除」など Clerk 削除と混同する文言を使わない

## 3. 自分自身への操作

| 操作 | 方針 |
| --- | --- |
| 自分をグループから外す | 禁止（`assertNotSelfOperator`） |
| 自分のロール変更 | **禁止**（`assertNotSelfOperator`）。オーナー譲渡は `transferGroupOwnership`（#222） |
| 自分へのオーナー譲渡 | **禁止**（`assertNotSelfOperator`） |

## 4. 最後の owner 保護（Phase1/Phase2 共通）

| ルール | Phase1 実装 | Phase2 実装 |
| --- | --- | --- |
| owner ロールの解除禁止 | `assertRemovableGroupMemberRole` | 継続 |
| 最後の owner の降格禁止 | — | `by_group_id_and_role` + `.take(2)` を使う `assertAnotherGroupOwnerRemains`（#223, #472） |
| オーナー譲渡時の同時更新 | — | `transferGroupOwnership`（#222）。譲渡先を `owner` にしてから譲渡元を `member` に降格 |

## 5. 後続 Issue 実装チェックリスト

新しい管理 mutation / UI を追加するときは、以下をすべて確認する。

### Convex

- [ ] 未認証ユーザーを拒否している
- [ ] `requireGroupOwner` または同等の owner 検証がある
- [ ] 明示的 `groupId` には `assertActiveGroupScope` がある
- [ ] 危険操作は対象ロール・自己操作・最後の owner を検証している
- [ ] `GROUP_ADMIN_ERRORS` の文言を使っている（または同等の明確な日本語）
- [ ] unit test で `member` の直接呼び出し拒否を検証している
- [ ] 該当する場合、影響を受けたメンバーへ `group_*` テンプレートのメール通知を enqueue している

### UI

- [ ] owner 以外に管理 UI を出していない
- [ ] 危険操作に確認ダイアログがある
- [ ] 失敗時に `getConvexErrorMessage` で表示している
- [ ] 「グループから外す」と「ユーザー削除」を混同する文言がない

## 6. 参照実装

| 機能 | Convex | UI |
| --- | --- | --- |
| メンバー追加 | `addMemberByEmail` + `requireGroupOwner` | `GroupSettingsPanel` 招待フォーム |
| メンバー解除 | `removeMember` + 共通ガード | `GroupSettingsPanel` + 確認ダイアログ |
| ロール変更 | `changeMemberRole` + 共通ガード | `GroupMemberList` + 確認ダイアログ |
| オーナー権限譲渡 | `transferGroupOwnership` + 共通ガード | `GroupSettingsPanel` 危険な操作 + 確認ダイアログ |
| グループ削除 | `requestGroupDeletion` + `requireGroupOwner` + 物理削除ジョブ | `GroupDangerZone` 危険な操作 + 確認ダイアログ |
| メンバー招待 | `inviteMember` action + `assertGroupOwnerRole` | `GroupSettingsPanel` 招待フォーム |
