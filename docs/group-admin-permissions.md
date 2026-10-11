# グループ管理機能の Phase1/Phase2 境界と権限モデル

このドキュメントは、管理機能 Phase1（M20）と Phase2（M21）の境界、
`owner` / `member` の権限差、危険操作の扱いを定義する正本である。

親 Issue: [#209 グループ/メンバー管理MVPを整備する](https://github.com/hondasports/kakeibo/issues/209)
境界整理 Issue: [#212](https://github.com/hondasports/kakeibo/issues/212)

後続 Issue（#213 以降）は、このドキュメントを前提に実装する。

## 1. 目的

- Phase1 で作る管理操作と Phase2 へ送る操作を明確にする
- `owner` と `member` の権限差を一貫した表で整理する
- 「グループから外す」と「Clerk ユーザー削除」を混同しない
- UI 非表示だけに頼らず、Convex mutation 側で権限検証する方針を明記する
- 最後の `owner` を守る考え方を Phase1/Phase2 全体で共有する

## 2. 用語

| 用語 | 意味 |
| --- | --- |
| グループ管理 | 家族グループ単位の設定・メンバー・招待の運用。アプリ全体の管理者機能ではない |
| `owner` | グループ内の管理権限を持つロール。Phase1 の管理操作は原則 `owner` のみ |
| `member` | グループに所属する一般メンバー。家計データの閲覧・入力はできるが管理操作はできない |
| active group | `users.activeGroupId` で示す、現在操作対象のグループ |
| グループから外す | `groupMembers` から対象ユーザーの所属行を削除する操作。Clerk アカウントは削除しない |
| Clerk ユーザー削除 | Clerk 上の認証アカウント自体を削除する破壊的操作。グループ所属解除とは別物 |
| 危険操作 | 誤操作や権限昇格でデータ喪失・運用不能につながる管理操作 |

## 3. スコープの原則

### 3.1 Phase1（M20）で扱う単位

- **グループオーナー向けの日常運用** に限定する
- 対象は **active group 1件** の情報・メンバー・pending 招待
- アプリ全体の管理者画面、複数グループ横断管理は Phase1 では扱わない

### 3.2 Phase2（M21）で扱う単位

当初 Phase2 予定だった次の操作は #222–#225 で実装済みである。

- オーナー移譲、ロール変更、グループ削除など **不可逆または権限構造を変える操作**（実装済み）
- 監査ログ（実装済み）
- Clerk ユーザー削除（セルフサービス退会）は `/settings/account/delete` として実装済み。group admin から他ユーザーの Clerk アカウントを削除する機能は提供しない
- アプリ全体管理者画面・複数グループ横断管理は **システム管理者機能として `/admin` で実装済み**

### 3.3 認可の正本

- グループ所属とロールの正本は `groupMembers` テーブル
- Clerk invitation は招待メール送信とサインアップ導線に使う。所属の正本ではない
- 家計データの認可は `groupId` と `groupMembers` で行う（`docs/technical-design.md` 6.1 参照）

## 4. 権限モデル（owner / member）

### 4.1 ロール定義

| ロール | 説明 | 付与タイミング |
| --- | --- | --- |
| `owner` | グループの管理責任者。Phase1 管理操作の実行者 | グループ作成時に作成者へ付与 |
| `member` | グループ参加者。家計データの利用者 | 招待受け入れ時、またはオーナーによる追加時 |

現行 MVP では **1 グループあたり `owner` は 1 人** を前提とするが、#223 により `member` → `owner` への昇格で **複数 owner** を許容する。`owner` → `member` への降格は、降格後も最低 1 人の owner が残る場合のみ可能とする。

### 4.2 操作別権限マトリクス

| 操作カテゴリ | `owner` | `member` | Phase | 備考 |
| --- | --- | --- | --- | --- |
| グループ情報の閲覧（名前、メンバー数） | 可 | 可 | 既存 | 管理画面の詳細は Phase1 で owner 中心に整理（#214） |
| メンバー一覧の閲覧 | 可 | 可（既存 UI） | Phase1 整備（#216） | 管理画面向け表示は owner 向けに整備 |
| pending 招待一覧の閲覧 | 可 | 不可 | Phase1（#218） | mutation でも拒否 |
| グループ名変更 | 可 | 不可 | Phase1（#215） | |
| メンバー招待（Clerk invitation） | 可 | 不可 | 既存 | `addMemberByEmail` 等 |
| pending 招待取り消し | 可 | 不可 | Phase1（#219） | |
| メンバーのグループ解除 | 可 | 不可 | Phase1（#217） | 対象は `member` のみ（後述）。`group_membership_removed` メール通知を送信 |
| active group の切り替え | 可 | 可 | 既存 | 自分が所属するグループに限る |
| 家計データの閲覧・入力 | 可 | 可 | 既存 | 管理権限とは独立 |
| オーナー権限譲渡 | 可（`member` へ） | 不可 | Phase2（#222 実装済み） | 譲渡元は `member` に降格。`changeMemberRole` とは別 mutation。`group_ownership_received` / `group_ownership_transferred` メール通知を送信 |
| ロール変更 | 可（自グループ・他メンバー） | 不可 | Phase2（#223 実装済み） | 自分自身は不可。最後の owner 降格不可。`group_role_changed` メール通知を送信 |
| グループ削除 | 可（`owner` のみ） | 不可 | Phase2（#224 実装済み） | 物理削除。家計データ・所属・招待を削除。Clerk / `users` は削除しない。`group_deleted` メール通知をメンバー全員へ送信 |
| Clerk ユーザー削除（セルフサービス退会） | 不可 | 不可 | group admin からは削除不可。`#480` で `/settings/account/delete` として実装済み | ユーザー本人のみ |
| アプリ全体管理者操作 | 不可 | 不可 | 実装済み（#227 システム管理者 `/admin`） | |

### 4.3 member に許可しない理由

`member` は家計データの共同利用者であり、グループ構成の変更権限は持たない。
招待の取り消しや他メンバーの除外は、誤操作・嫌がらせ・データアクセス喪失につながるため、
Phase1 では `owner` のみに限定する。

## 5. Phase1 で実装する管理操作

Phase1 の実装対象は次のとおり。UI と Convex mutation の両方で権限を守る。

| # | 操作 | 実装 Issue | owner 必須 | 確認 UI | 備考 |
| --- | --- | --- | --- | --- | --- |
| 1 | グループ名変更 | #215 | はい | 任意（軽微変更） | active group のみ |
| 2 | メンバー一覧（管理画面向け） | #216 | 閲覧は member 可、管理 UI は owner 向け | 不要 | 表示構成は #214 |
| 3 | メンバーのグループ解除 | #217 | はい | **必須** | `member` ロールのみ対象。`group_membership_removed` メール通知を送信 |
| 4 | pending 招待一覧 | #218 | はい | 不要 | |
| 5 | pending 招待取り消し | #219 | はい | **必須** | |

### 5.1 Phase1 の共通実装方針

実装パターンとチェックリストの正本は `docs/group-admin-guards.md` を参照する。

- 権限ガードの共通化は #213 で整備する
- UI でボタンを隠すだけでは完了としない。mutation 直呼びでも拒否する
- 操作対象は **呼び出し元の active group** に限定する。他グループの ID を渡しても拒否する
- エラーメッセージはユーザーが次の行動を取れる文言にする（例: 「グループオーナーのみ実行できます」）

## 6. 当初 Phase2 予定の操作（#222–#225 で実装済み）

以下は Phase1 MVP の必須要件外として当初 Phase2 に送ったが、#222–#225 で実装済みである。
Clerk ユーザー削除（セルフサービス退会）は #480 で `/settings/account/delete` として実装済み。
group admin から他ユーザーの Clerk アカウントを削除する機能は提供しないため、Phase2 候補から外す。

| 操作 | Issue | 危険度 | 当初 Phase2 に送った理由 | 状態 |
| --- | --- | --- | --- | --- |
| ロール変更（member ↔ owner） | #223 | 高 | 権限昇格・最後の owner 喪失リスク | 実装済み |
| 管理操作の監査ログ | #225 | 中 | Phase1 MVP の必須要件外 | 実装済み |
| オーナー権限譲渡 | #222 | 高 | 最後の owner 喪失リスク。専用フローと確認が必要 | 実装済み |
| グループ削除 | #224 | 高 | 家計データ・所属の一括喪失 | 実装済み |
| Clerk ユーザー削除（セルフサービス退会） | #480 | 最高 | 認証基盤の破壊的操作。ユーザー自身のみ `/settings/account/delete` から実行 | 実装済み |
| アプリ全体管理者画面 | #227 | 高 | グループ単位管理とは別プロダクト判断 | 実装済み |
| 複数グループ横断管理 | #227 | 高 | 同上 | 実装済み |

### 6.1 オーナー権限譲渡（#222 実装済み）

`transferGroupOwnership` mutation と危険な操作 UI で提供する。`changeMemberRole` とは責務を分離する。

| ルール | 内容 |
| --- | --- |
| 実行権限 | `owner` のみ（`requireGroupOwner`） |
| 譲渡先 | 同一 active group の `member` ロールのみ。`owner` への昇格は `changeMemberRole` を使う |
| pending 招待 | `groupMembers` に存在しないため譲渡不可 |
| 譲渡後の旧 owner | **`member` に降格**（共同 owner 化は譲渡では行わない） |
| 更新順序 | 譲渡先を `owner` に昇格してから、譲渡元を `member` に降格（最後の owner 不在を避ける） |
| 監査ログ | `owner_transferred` を記録（#225） |
| 通知 | 譲渡先へ `group_ownership_received`、譲渡元へ `group_ownership_transferred` のメール通知を送信する |
| 確認 UI | 現在の owner / 譲渡先 / 譲渡後の旧 owner role を確認ダイアログで表示 |

### 6.2 グループ削除（#224 実装済み）

`deleteGroup` mutation と危険な操作 UI で提供する。グループと紐づく Convex データを物理削除する。

| ルール | 内容 |
| --- | --- |
| 実行権限 | `owner` のみ（`requireGroupOwner`） |
| 削除方式 | 削除リクエストを受け付けると `groupDeletionJobs` を作成し、バックグラウンド worker が順次物理削除する。対象テーブル: `groups`, `groupMembers`, `groupInvitations`, `expenseEntries`, `receipts`, `categories`, `sourceDocuments`（添付画像ストレージ含む）, `weekSessions`, `aiExpenseDrafts`, `aiExpenseDraftItems`, `receiptAnalysisBatches`, `receiptAnalysisImageJobs` |
| 削除しない | `users`, Clerk アカウント, `managementAuditLogs`（監査証跡として保持） |
| activeGroupId | 削除対象を active にしていた全メンバーへ、別の所属グループまたは `null` を設定 |
| 監査ログ | 削除実行前に `group_deleted` を記録（`afterValue` に削除件数サマリ `affectedCounts` を含む） |
| 通知 | 削除前に `groupMembers` 全員へ `group_deleted` のメール通知を送信する |
|| ジョブ管理 | `groupDeletionJobs` が削除進行状況を、`groupDeletionNotificationRecipients` がメンバーへの通知状態を管理する |
| 確認 UI | 対象グループ名、削除対象データの影響範囲（件数付き）、完全削除・復旧不可の警告、Clerk/ユーザー非削除の注記、確認用グループ名入力 |
| 成功後遷移 | 他に所属グループがあれば `/group/select`、なければ `/group/setup` |

## 7. 重要な境界

### 7.1 グループから外す ≠ Clerk ユーザー削除

| 観点 | グループから外す（Phase1） | Clerk ユーザー削除（セルフサービス退会） |
| --- | --- | --- |
| 変更対象 | `groupMembers` の 1 行 | Clerk 上のユーザーアカウント |
| 他グループへの所属 | 残る | アカウントごと失効 |
| 再参加 | 再招待で可能 | アカウント復旧は別フロー |
| 家計データ | グループデータは残る | ユーザー識別子の扱いを要設計 |
| 現行実装 | `removeMember`（#217 で強化） | `/settings/account/delete`（#480）で実装済み。group admin からの削除は提供しない |

`removeMember` は **対象ユーザーの `users` レコードや Clerk アカウントを削除しない**。
ドキュメント・UI・エラーメッセージでも「ユーザー削除」と表現しない。

### 7.1.1 メール招待の有効状態（グループ×メール）

| 状態 | ルール |
| --- | --- |
| 有効な pending | グループ×メールあたり実質 1 件。再送時は古い pending を `revoked` にしてから新規作成する |
| 一覧表示 | `listPendingGroupInvitations` は同一メール（Gmail alias 含む）を最新 1 件にまとめて返す |
| 受け入れ | `acceptGroupInvitation` 成功後、同一メールの他 pending も `revoked` にする |
| メンバー解除 | `removeMember` 時に対象メールの pending と、所属外となった accepted を `revoked` にする |
| 再参加 | 上記により削除済みメンバーへ再招待可能 |

`#219` の pending 取り消しは、一覧行の `_id` ではなく **メール単位で同一メールの pending をまとめて無効化** する実装を前提とする（表示は dedupe 済みのため）。

### 7.1.2 招待・グループ作成の上限（濫用対策）

認証済みユーザーが Clerk の招待メールを大量送信したり、`groupInvitations` を無制限に増やしたりできないよう、次の決定的な上限をサーバー側で課す。Clerk 呼び出しより前に判定し、超過時は `ConvexError` で拒否する。

| 項目 | 上限 | 定数 | 備考 |
| --- | --- | --- | --- |
| 1 グループの pending 招待 | 20 件 | `MAX_PENDING_GROUP_INVITATIONS` | 同一メールへの再招待は旧 pending を `revoked` にしてから数えるため、上限到達時も可能。取り消し・承諾で枠が空く |
| 1 ユーザーが owner のグループ数 | 10 個 | `MAX_OWNED_GROUPS_PER_USER` | `member` として参加しているだけのグループは数えない。`createGroup` で判定 |
| 招待メールアドレス長 | 254 文字 | `MAX_EMAIL_LENGTH` | ローカル部は 64 文字まで |
| 招待メールアドレス形式 | `@` が 1 つ、空白なし、ドメインは 2 ラベル以上 | `validateInvitationEmail` | `inviteMember` は DB 予約・Clerk 呼び出しより前に検証。`addMemberByEmail` も同じ検証を使う |

日次の送信回数など時間窓の上限は専用テーブルが必要なため未実装。Clerk 側のレート制限・Restricted sign-up 設定はオーナーが Clerk ダッシュボードで確認する。

### 7.2 UI 非表示だけに頼らない

管理操作は次の 2 層で守る。

1. **UI 層**: `member` には管理ボタン・導線を表示しない
2. **Convex 層**: mutation 入口で `groupMembers` のロールを検証し、`owner` でなければ `ConvexError` で拒否する

`member` が DevTools やクライアント改変で mutation を直接呼んでも、サーバー側で必ず失敗させる。
この方針の共通化は #213 が担う。

### 7.3 active group の境界

管理系 mutation は次を満たすこと。

- 呼び出し元ユーザーが認証済みである
- 操作対象の `groupId` が、呼び出し元の active group と一致する
- 呼び出し元がその `groupId` の `groupMembers` に存在する

他グループのメンバー ID や招待トークンを渡しても操作できないようにする。

## 8. 最後の owner を守る方針

グループに `owner` が 0 人になる状態は **禁止** する。
オーナー不在のグループは招待・設定・危険操作の責任主体がなくなるため。

### 8.1 Phase1 で守るルール

| ルール | 内容 | 実装状況 |
| --- | --- | --- |
| owner は自分自身をグループから外せない | 自己 `removeMember` 禁止 | 実装済み（`removeMemberHandler`） |
| owner ロールのメンバーはグループ解除の対象にしない | 対象は `member` のみ | 実装済み（UI + `assertRemovableGroupMemberRole`） |
| グループ作成時に作成者を `owner` として追加 | 初期 owner を必ず 1 人確保 | 実装済み（`createGroup`） |

### 8.2 Phase2 へ引き継ぐルール

| ルール | 内容 | 関連 Issue |
| --- | --- | --- |
| 最後の owner の降格禁止 | `owner` → `member` で owner が 0 人になる変更を拒否 | #223, #472（`assertAnotherGroupOwnerRemains`） |
| 最後の owner のグループ解除禁止 | owner が 1 人のとき、その人を外す操作を拒否 | #217, #222 |
| オーナー譲渡時の受け渡し | 譲渡先を `owner` に昇格し、譲渡元を `member` に降格（同一 mutation） | #222（`transferGroupOwnership`） |
| グループ削除時の owner 確認 | 削除実行前に owner であることと不可逆性を確認 | #224 |

### 8.3 エラー方針

最後の owner を守る拒否は、HTTP 403 相当の業務エラーとして `ConvexError` で返す。
「最後のオーナーは変更できません」など、原因が分かる日本語メッセージを使う。

## 9. 既存実装との対応

現行 main ブランチ時点の参考実装。

| 機能 | ファイル | owner 検証 | 備考 |
| --- | --- | --- | --- |
| メンバー追加 | `convex/groups/members.ts` `addMemberByEmail` | あり | |
| メンバー解除 | `convex/groups/members.ts` `removeMember` | あり | owner 対象拒否・自己操作拒否・users 非削除を実装済み（#217） |
| ロール変更 | `convex/groups/members.ts` `changeMemberRole` | あり | 最後の owner 保護・監査ログ（#223, #225） |
| 支出一括カテゴリ変更・削除の監査 | `lib/convex/spending/bulkOpsHandlers.ts` | 記録はメンバー可、閲覧は owner | `spending_bulk_category_changed` / `spending_bulk_deleted`。金額・店名は残さない（#550） |
| オーナー権限譲渡 | `convex/groups/members.ts` `transferGroupOwnership` | あり | 譲渡先は member のみ。昇格→降格順（#222, #225） |
| グループ管理 UI | `src/features/group-admin/components/GroupSettingsPanel.tsx` | UI のみ | Phase1 で画面構成整理（#214） |
| グループ運用手順 | `docs/technical-design.md` 6.3 | — | 本ドキュメントを正本とする |

## 10. 後続 Issue への参照

| 順序 | Issue | 本ドキュメントの参照セクション |
| --- | --- | --- |
| 1 | #212（本 Issue） | 全体 |
| 2 | #213 管理操作共通ガード | `docs/group-admin-guards.md` |
| 3 | #214 画面構成 | 4.2, 5, `docs/group-admin-ui-layout.md` |
| 4 | #215 グループ名変更 | 4.2, 5 |
| 5 | #216 メンバー一覧 | 4.2, 5 |
| 6 | #217 メンバー解除 | 7.1, 8.1 |
| 7 | #218 pending 一覧 | 4.2, 5 |
| 8 | #219 pending 取り消し | 4.2, 5, 7.2 |
| 9 | #220 権限テスト/E2E | 4.2, 7.2 |
| — | #221–#227 Phase2 | 6, 8.2 |

## 11. 完了条件（#212）

- [x] Phase1/Phase2 の境界が明確になっている（セクション 3, 5, 6）
- [x] owner/member の権限差が整理されている（セクション 4）
- [x] Phase1 で実装しない危険操作が明記されている（セクション 6）
- [x] 後続 Issue がこの方針を参照できる（セクション 10）

## 12. 受け入れ確認（#209）

親 Issue [#209](https://github.com/hondasports/kakeibo/issues/209) の受け入れ条件。
子 Issue #212–#220 の完了後、以下で Phase1 MVP の受け入れを確認する。

| 受け入れ条件 | 確認方法 | 状態 |
| --- | --- | --- |
| owner はグループ管理画面でグループ情報・メンバー・pending 招待を確認できる | `GroupSettingsPanel` UI + `e2e/group-access.spec.ts` | [x] |
| owner は Phase1 対象の管理操作を実行できる | `convex/groups/members.ts` mutations + E2E smoke | [x] |
| member は管理操作を実行できない | UI 非表示 + `GroupSettingsPanel.test.tsx` | [x] |
| member が直接 mutation を呼んでも拒否される | `convex/groups/groups.test.ts` Phase1 owner-only permissions | [x] |
| グループからのメンバー解除と Clerk ユーザー削除が混同されていない | §7.1 + `removeMemberHandler` unit test | [x] |
| pending 招待の表示・取り消しができる | `GroupPendingInvitationList` + E2E | [x] |
| 危険操作には確認導線がある | `ConfirmDangerousActionDialog` + E2E | [x] |
| Phase2 対象機能は M21 の Issue として分離されている | §6 + 危険な操作セクション（#222 譲渡 UI、#224 削除 UI） | [x] |

検証コマンド（push 前）:

```bash
pnpm test --run
pnpm run lint && pnpm run format:check && pnpm run build
# Clerk 資格情報がある環境のみ
pnpm exec playwright test e2e/group-access.spec.ts --grep @group-access
```
