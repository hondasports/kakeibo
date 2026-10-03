import { TRANSACTIONAL_EMAIL_TYPES, type TransactionalEmailType } from "../../email/model";

export type NotificationChannel = "email" | "line";
export const NOTIFICATION_CHANNELS = ["email", "line"] as const;

export const AI_REVIEW_REQUIRED_NOTIFICATION_TYPE =
  "ai_review_required" satisfies TransactionalEmailType;

export const NOTIFICATION_TYPE_LABELS: Record<TransactionalEmailType, string> = {
  email_delivery_test: "メール配信テスト",
  group_membership_removed: "グループからの除外",
  group_role_changed: "グループ権限の変更",
  group_ownership_received: "オーナー権限の譲受",
  group_ownership_transferred: "オーナー権限の譲渡",
  group_deletion_started: "グループ削除の開始",
  group_deletion_failed: "グループ削除の失敗",
  group_deleted: "グループ削除の完了",
  ai_review_required: "AIレビュー依頼",
  account_deletion_completed: "退会完了",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "メール",
  line: "LINE",
};

export type NotificationCatalogEntry = {
  type: TransactionalEmailType;
  label: string;
  mandatory: boolean;
  lineSupported: boolean;
};

export const NOTIFICATION_CATALOG: readonly NotificationCatalogEntry[] =
  TRANSACTIONAL_EMAIL_TYPES.map((type) => ({
    type,
    label: NOTIFICATION_TYPE_LABELS[type],
    mandatory: type !== AI_REVIEW_REQUIRED_NOTIFICATION_TYPE && type !== "email_delivery_test",
    lineSupported: type === AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  }));

const catalogByType = new Map<TransactionalEmailType, NotificationCatalogEntry>(
  NOTIFICATION_CATALOG.map((entry) => [entry.type, entry]),
);

export function getNotificationCatalogEntry(
  type: TransactionalEmailType,
): NotificationCatalogEntry {
  const entry = catalogByType.get(type);
  if (!entry) throw new Error(`Unknown notification type: ${type}`);
  return entry;
}

export function isTransactionalEmailType(value: unknown): value is TransactionalEmailType {
  return (
    typeof value === "string" && (TRANSACTIONAL_EMAIL_TYPES as readonly string[]).includes(value)
  );
}

export function isMandatoryEmailType(type: TransactionalEmailType): boolean {
  return getNotificationCatalogEntry(type).mandatory;
}

export function supportsNotificationChannel(
  type: TransactionalEmailType,
  channel: NotificationChannel,
): boolean {
  if (channel === "email") return true;
  return getNotificationCatalogEntry(type).lineSupported;
}

export function defaultNotificationEnabled(
  _type: TransactionalEmailType,
  channel: NotificationChannel,
): boolean {
  return channel === "email";
}

export type UserNotificationPreferences = {
  aiReviewRequiredEmailEnabled: boolean;
  aiReviewRequiredLineEnabled: boolean;
};

export const DEFAULT_USER_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  aiReviewRequiredEmailEnabled: true,
  aiReviewRequiredLineEnabled: false,
};

export type NotificationDisabledReason =
  | "globally_disabled"
  | "user_opted_out"
  | "line_not_opted_in"
  | "unsupported_channel"
  | "user_deleted"
  | "user_deleting";

export type NotificationDeliveryDecision = {
  enabled: boolean;
  reason?: NotificationDisabledReason;
};

function normalizePersonalEnabled(personalEnabled: unknown): boolean | undefined {
  return typeof personalEnabled === "boolean" ? personalEnabled : undefined;
}

export function resolveNotificationDelivery(args: {
  type: TransactionalEmailType;
  channel: NotificationChannel;
  globalEnabled: boolean;
  personalEnabled?: unknown;
}): NotificationDeliveryDecision {
  const { type, channel, globalEnabled } = args;

  if (!supportsNotificationChannel(type, channel)) {
    return { enabled: false, reason: "unsupported_channel" };
  }
  if (!globalEnabled) {
    return { enabled: false, reason: "globally_disabled" };
  }

  if (channel === "line") {
    const personal = normalizePersonalEnabled(args.personalEnabled);
    return personal === true ? { enabled: true } : { enabled: false, reason: "line_not_opted_in" };
  }

  if (type !== AI_REVIEW_REQUIRED_NOTIFICATION_TYPE) {
    return { enabled: true };
  }

  const personal = normalizePersonalEnabled(args.personalEnabled);
  return personal === false ? { enabled: false, reason: "user_opted_out" } : { enabled: true };
}
