# グループ管理画面の表示構成

グループ管理 UI（`GroupSettingsPanel`）のセクション構成と Phase1/Phase2 の表示境界を定義する。

関連 Issue: [#214](https://github.com/hondasports/kakeibo/issues/214)
権限の正本: `docs/group-admin-permissions.md`

## 1. 画面位置

- ルート: `/settings`
- コンポーネント: `src/features/group-admin/components/GroupSettingsPanel.tsx`
- セクション部品: `GroupSettingsSection`, `GroupRenameSection`, `GroupInviteSection`, `GroupMemberList`, `GroupDangerZone` 等
- 操作ロジック: `hooks/useGroupRenameManagement`, `useGroupInviteManagement`, `useGroupRoleManagement` 等

## 2. 設定台帳内の構成（上から順）

`GroupSettingsPanel`（グループ・カテゴリ・週の設定を含む設定台帳）内のグループ管理セクション:

| 順序 | セクション | testId | owner | member | Phase1 操作 |
| --- | --- | --- | --- | --- | --- |
| 1 | グループ情報 | `group-info-section` | 表示 | 表示 | グループ切替（既存）、グループ名変更（#215 で有効化） |
| 2 | メンバー管理 | `member-management-section` | 表示 | 表示 | 一覧（#216）、解除（#217・owner のみ） |
| 3 | 招待管理 | `invite-management-section` | 表示 | **非表示** | 招待送信（既存）、pending 一覧（#218）、取り消し（#219） |
| 4 | 管理操作ログ | `management-audit-log-section` | 表示 | **非表示** | 管理操作の監査ログ閲覧（#225） |

`SettingsPage` の設定台帳最下部（グループ・カテゴリ・週の設定セクションの外）:

| 順序 | セクション | testId | owner | member | 操作 |
| --- | --- | --- | --- | --- | --- |
| 5 | 危険な操作 | `danger-zone-section` | 折りたたみ表示 | **非表示** | メンバー解除、オーナー権限譲渡、グループ削除 |

`member` には招待管理・管理操作ログ・危険な操作を出さず、画面下部に「招待と削除はオーナーのみ操作できます。」を表示する。

## 3. グループ情報セクション

### owner

- ロール Chip、メンバー数 Chip
- 複数グループ所属時: グループ切替セレクト + 切替ボタン + 現在グループ名変更フォーム
- 単一グループ時: グループ名変更フォーム（#215 で有効化済み）

### member

- ロール Chip、メンバー数 Chip
- 複数グループ所属時: グループ切替（既存どおり）
- グループ名変更フォームは非表示

## 4. メンバー管理セクション

### owner / member 共通

- メンバー一覧（表示名、メール、ロール Chip、「あなた」Chip）

### owner のみ

- 他メンバーのロール変更 Select + 確認ダイアログ（#223）

### member

- 解除ボタン非表示

## 5. 招待管理セクション（owner のみ）

- 招待メール入力 + 送信ボタン（既存）
- 送信済み pending 招待一覧（`GroupPendingInvitationList`、同一メールは最新 1 件のみ表示）
- 招待取り消し（#219 で一覧行に追加。取り消しはメール単位で無効化する）

## 6. 危険な操作セクション（owner のみ）

`SettingsPage` の設定台帳最下部に配置する（`GroupDangerZone`）。`GroupSettingsPanel` とは別コンポーネント。

- **初期状態は折りたたみ**: `aria-expanded`を持つAccordionで開閉し、キーボード操作に対応する
- **メンバー解除**: 通常のメンバー一覧から分離し、対象選択 + 確認ダイアログで実行する
- **オーナー権限の譲渡（#222 実装済み）**: 譲渡先 `member` 選択 + 確認ダイアログ + `transferGroupOwnership`
- **グループの削除（#224 実装済み）**: 確認ダイアログ + `requestGroupDeletion`（非同期の物理削除。復旧不可）。受け付け後は `/group/delete/status/:jobId` へ遷移する

## 7. 管理操作ログセクション（owner のみ）

`GroupSettingsPanel` 内、招待管理の直下に独立セクションとして配置する（#225 実装済み）。

- `management-audit-log-section` で `GroupManagementAuditLogList` を表示する
- 危険な操作セクションとは分離する

## 8. UI 状態

| 状態 | 表示 |
| --- | --- |
| 読込中 | パネル全体でスピナー + 「グループ設定を読み込んでいます。」 |
| グループ未作成 | info Alert「グループ作成後にメンバー管理を利用できます。」 |
| エラー | パネル上部に error Alert（操作失敗メッセージ） |
| 成功 | Snackbar（招待送信、メンバー解除、ロール変更、オーナー譲渡、グループ切替）。グループ削除は状況画面へ遷移する |

## 9. レスポンシブ

- フォーム行は `direction={{ xs: "column", sm: "row" }}` でスマホ幅では縦積み
- メンバー行は `group-member-row` で折り返し（`App.css`）

## 10. 後続 Issue への差し込み位置

| Issue | 差し込み先 |
| --- | --- |
| #215 グループ名変更 | グループ情報セクションのグループ名変更フォーム（有効化済み） |
| #216 メンバー一覧 | メンバー管理セクションの一覧表示を強化 |
| #217 メンバー解除 | メンバー管理セクション（既存ボタンを #213 ガードに合わせて強化） |
| #218 pending 一覧 | 招待管理セクションに `GroupPendingInvitationList` を配置（完了） |
| #219 pending 取り消し | 招待管理セクションの一覧行に追加 |
| #222 オーナー権限譲渡 | 危険な操作セクション（譲渡 UI + 確認ダイアログ） |
| #223 ロール変更 | メンバー管理セクションの `GroupMemberList` ロール Select |
| #224 グループ削除 | 危険な操作セクション（削除 UI + 確認ダイアログ） |
| #225 管理操作ログ | 管理操作ログセクション |
