# 認証ガード適用方針

このドキュメントは、kakeibo プロジェクト（UI ブランド名: Suzumemo）における Clerk + Convex 認証の適用方針を定義します。

## 全体方針

Clerk Restricted mode はアプリへの入口制限（招待制ユーザー管理）であり、
Convex データへの認可とは別の仕組みです。
ユーザー向けの保護された Convex API は `ctx.auth.getUserIdentity()` から主体を解決し、
未認証の家計データ取得・変更を拒否します。退会状態 query の明示的な例外、公開 API、内部関数は
それぞれの入口の契約に従います。

家計データの所有境界は **グループ（`groupId`）** です。ユーザーは `groupMembers` を通じて
1 つ以上のグループに所属し、`users.activeGroupId` で表示対象グループを選択します。

## Convex 側の認証・認可

### 基本ルール

| ルール           | 詳細                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| 認証確認         | ユーザー向けの保護された API は共通ヘルパー等を通じて `ctx.auth.getUserIdentity()` を確認する |
| 未認証拒否       | 保護された API は `identity === null` の場合に `ConvexError("Not authenticated")` をスローする |
| 認可キー         | `identity.tokenIdentifier` を優先する（`subject` は使わない）                              |
| userId の解決    | クライアント引数を信用せず、サーバー側で `identity.tokenIdentifier` から解決する         |
| データ所有境界   | receipt / category / weekSession / expenseEntry などの家計データは **`groupId`** で分離する |
| グループ所属確認 | 家計データへアクセスする query / mutation では `requireGroupMembership` 等で所属を確認する |

### 退会状態 query の例外

`convex/accountDeletion.ts` の `getMyAccountDeletionStatus` は、退会完了直後などの認証遷移中は
例外ではなく `null` を返します（`convex/accountDeletion.test.ts`）。未認証時にユーザーや
家計データを返すものではなく、家計データ API の認証・グループ所属確認を省略する根拠にはなりません。

### 共通ヘルパー

**認証（`convex/users/auth.ts`）**

```typescript
// 未認証時は ConvexError をスロー、認証時は tokenIdentifier を返す
export async function requireAuthenticatedUserId(ctx: AuthContext): Promise<string>

// identity から AuthState を生成する純粋関数（query の返り値作成に使う）
export function getAuthStateFromIdentity(identity: UserIdentity | null): AuthState
```

**ユーザー upsert（`convex/users/mutations.ts`）**

```typescript
// ログイン後に呼び出す mutation。users テーブルを upsert する
export const upsertUser = mutation({ args: {}, handler: async (ctx) => { ... } })
```

**グループ認可（`convex/groups/membership.ts` / `convex/groups/adminGuards.ts`）**

```typescript
// 認証済みユーザーの active group メンバーシップを取得。未所属なら throw
export async function requireGroupMembership(ctx): Promise<GroupMembership>

// active group のオーナー権限を要求
export async function requireGroupOwner(ctx): Promise<GroupMembership>

// クライアントが指定した groupId が active group と一致するか確認
export function assertActiveGroupScope(requestedGroupId, activeGroupId): void
```

### query / mutation での使用例

```typescript
import { requireGroupMembership } from "./groups/membership";

export const listExpenseEntries = query({
  args: {},
  handler: async (ctx) => {
    const { groupId } = await requireGroupMembership(ctx);
    return await ctx.db
      .query("expenseEntries")
      .withIndex("by_group_id_and_date", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(50);
  },
});
```

`receipts` テーブルも同様に `by_group_id_and_date` インデックスで `groupId` を絞り込む。
詳細は `docs/group-admin-permissions.md` を参照する。

### システム管理者の認可

システム管理者向け query / mutation は、通常ユーザー向けの認証ヘルパーに加えて
`requireSystemAdmin(ctx)` を入口で実行する。`systemAdmins` の active record だけを許可し、
クライアント引数、Clerk metadata、メールアドレスを権限根拠にしない。

**現行コードでは `systemAdmins` テーブルと関連関数は実装済み**である。`/admin` UI と
管理 API（ユーザー・グループ検索、権限付与・剥奪、監査ログ、グループ復旧・削除など）も
実装済み。設計の正本は `docs/system-admin-authorization.md` を参照する。

この認可は家計データのグループ認可を置き換えない。

## フロントエンド側の認証ガード

### Provider 構成（`src/main.tsx`）

```
ClerkProvider
  └── ConvexProviderWithClerk   ← Clerk JWT を Convex リクエストに付与
        └── ThemeProvider
              └── App
```

`ConvexProviderWithClerk` が Clerk の JWT を自動的に Convex リクエストに付与します。

### 認証状態のチェック順序（`App.tsx`）

`/sso-callback` はClerkの認証コールバックとして直接処理する。公開パスと未定義URLは認証前に
`RouterProvider` へ渡し、公開ページや404を表示する。家計・設定・管理画面などの認証対象パスは
`AuthenticatedApp` で以下を順に確認する。

1. `useAuth().isLoaded` が `false` → ローディング表示
2. `useAuth().isSignedIn` が `false` → サインイン画面（`SignedOutScreen`）
3. `useConvexAuth().isLoading` が `true` → ローディング表示
4. `useConvexAuth().isAuthenticated` が `false` → 接続エラー表示
5. すべて通過 → `RouterProvider`（家計簿本体）

公開パスの定義は `src/features/app-shell/lib/publicPaths.ts` を参照する。

### グループルートガード（`src/router.tsx` の `GroupRouteGuard`）

認証済みユーザーが家計データ画面へ入る前に、グループ所属状態を確認する。

- グループ未所属 → `/group/setup` へリダイレクト
- 複数グループ所属かつ `activeGroupId` 未選択 → `/group/select` へリダイレクト
- アカウント削除中 → `/settings/account/delete/status` へリダイレクト

`/group/invitations/accept`、`/settings/account/delete/status`、`/group/delete/status/:jobId` は
`GroupRouteGuard` の外に置く。招待ページは未認証でも案内を表示するが、参加確定には認証と
本人の参加確認が必要である。削除状況も、ガードの外にあることを理由に他人のジョブを参照できるわけではない。

### useInitializeUser フック（`src/features/auth/hooks/useInitializeUser.ts`）

`AuthenticatedApp` 内で呼び出す。Convex 認証確立後に 1 回だけ `upsertUser` を呼び出し、
users テーブルにレコードを作成・更新します。

- Convex 認証が確立された直後に 1 度だけ実行される（`useRef` で重複実行防止）
- エラーは `console.error` に記録し、UI をブロックしない

## 環境変数

`CLERK_JWT_ISSUER_DOMAIN` など Convex / Clerk 関連の環境変数の設定方法は
`docs/environment-variables.md` を参照してください。

## 関連ファイル

| ファイル                                       | 役割                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `convex/auth.config.ts`                        | Convex の JWT issuer 設定（CLERK_JWT_ISSUER_DOMAIN を参照）        |
| `convex/schema.ts`                             | users / groupMembers / groups テーブル定義                         |
| `convex/users/auth.ts`                         | 認証ヘルパー（`requireAuthenticatedUserId` 等）                    |
| `convex/users/mutations.ts`                    | ユーザー向け mutation（`upsertUser` 等）                           |
| `convex/groups/membership.ts`                  | グループ所属確認（`requireGroupMembership` 等）                    |
| `convex/groups/adminGuards.ts`               | active group スコープ・オーナー権限                                |
| `src/main.tsx`                                 | ClerkProvider + ConvexProviderWithClerk の Provider 構成           |
| `src/App.tsx`                                  | 認証状態ガード（AuthenticatedApp）、公開パス分岐、`/sso-callback`（`OAUTH_CALLBACK_PATH`）の Clerk コールバック処理 |
| `src/router.tsx`                               | ルーティングと `GroupRouteGuard`                                   |
| `src/features/app-shell/lib/publicPaths.ts`    | 公開パス定義と `shouldUseRouterBeforeAuth`                         |
| `src/features/auth/hooks/useInitializeUser.ts` | ログイン後の users upsert フック                                   |
| `convex/systemAdmins.ts`                         | システム管理者の認可と管理 API                                     |
| `src/features/system-admin`                      | `/admin` UI と `SystemAdminRouteGuard`                             |
