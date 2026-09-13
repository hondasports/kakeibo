/**
 * systemAdminNotifications のドメイン型とストア・ポート（domain interface）。
 */
export type SystemAdminNotificationAction =
  | "system_admin_granted"
  | "system_admin_revoked"
  | "system_admin_recovered"
  | "system_admin_bootstrapped"
  | "system_admin_membership_changed"
  | "system_admin_ownerless_group_recovered"
  | "system_admin_group_invitation_revoked";

/** systemAdminNotifications ドキュメントのフィールド（書き込み用）。 */
export type SystemAdminNotificationFields = {
  action: SystemAdminNotificationAction;
  recipientUserId?: string;
  recipientEmail?: string;
  targetUserId?: string;
  targetEmailSnapshot?: string;
  dedupeKey: string;
  payloadJson: string;
  createdAt: number;
};

export type SystemAdminNotificationRecord = SystemAdminNotificationFields & { id: string };

export interface SystemAdminNotificationStore {
  /** dedupeKey で既存通知を1件取得する（冪等チェック用）。 */
  findByDedupeKey(dedupeKey: string): Promise<SystemAdminNotificationRecord | null>;
  /** 通知を挿入する。 */
  insert(fields: SystemAdminNotificationFields): Promise<string>;
}
