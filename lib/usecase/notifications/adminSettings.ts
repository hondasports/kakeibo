import { ConvexError } from "convex/values";
import type { TransactionalEmailType } from "../../email/model";
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_CHANNEL_LABELS,
  defaultNotificationEnabled,
  getNotificationCatalogEntry,
  isMandatoryEmailType,
  supportsNotificationChannel,
  type NotificationChannel,
} from "../../domain/notifications/model";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import { requireSystemAdminActor } from "../systemAdmin/actor";
import type { NotificationAdminMutationDeps, NotificationAdminQueryDeps } from "./deps";

export type AdminNotificationSettingItem = {
  type: TransactionalEmailType;
  channel: NotificationChannel;
  typeLabel: string;
  channelLabel: string;
  mandatory: boolean;
  enabled: boolean;
  configured: boolean;
  updatedAt?: number;
};

export type AdminNotificationSettingsList = {
  items: AdminNotificationSettingItem[];
};

export async function listNotificationSettings(
  deps: NotificationAdminQueryDeps,
  tokenIdentifier: string,
): Promise<AdminNotificationSettingsList> {
  await requireSystemAdminActor(deps, tokenIdentifier);
  const stored = new Map(
    (await deps.settings.listAll(NOTIFICATION_CATALOG.length * 2)).map((setting) => [
      `${setting.type}:${setting.channel}`,
      setting,
    ]),
  );
  const items: AdminNotificationSettingItem[] = [];
  for (const entry of NOTIFICATION_CATALOG) {
    for (const channel of ["email", "line"] as const) {
      if (!supportsNotificationChannel(entry.type, channel)) continue;
      const setting = stored.get(`${entry.type}:${channel}`);
      items.push({
        type: entry.type,
        channel,
        typeLabel: entry.label,
        channelLabel: NOTIFICATION_CHANNEL_LABELS[channel],
        mandatory: entry.mandatory,
        enabled: setting?.enabled ?? defaultNotificationEnabled(entry.type, channel),
        configured: setting !== undefined,
        ...(setting ? { updatedAt: setting.updatedAt } : {}),
      });
    }
  }
  return { items };
}

export async function updateNotificationSetting(
  deps: NotificationAdminMutationDeps,
  args: {
    tokenIdentifier: string;
    type: TransactionalEmailType;
    channel: NotificationChannel;
    enabled: boolean;
    reason: string;
    confirmMandatoryEmailDisable?: boolean;
  },
): Promise<{ changed: boolean; enabled: boolean }> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);

  if (!supportsNotificationChannel(args.type, args.channel)) {
    throw new ConvexError("この通知種別は指定されたチャネルに対応していません");
  }

  const reasonResult = normalizeSystemAdminReason(args.reason);
  if (!reasonResult.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(reasonResult.error));
  }
  const reason = reasonResult.reason;

  if (
    args.channel === "email" &&
    isMandatoryEmailType(args.type) &&
    !args.enabled &&
    args.confirmMandatoryEmailDisable !== true
  ) {
    throw new ConvexError("必須メールを無効化するには明示的な確認が必要です");
  }

  const now = Date.now();
  const existing = await deps.settings.findByTypeAndChannel(args.type, args.channel);
  const before = existing?.enabled ?? defaultNotificationEnabled(args.type, args.channel);

  if (before === args.enabled) {
    return { changed: false, enabled: args.enabled };
  }

  if (existing) {
    await deps.settings.patch(existing.id, {
      enabled: args.enabled,
      updatedByUserId: actor.user.docId,
      updatedAt: now,
    });
  } else {
    await deps.settings.insert({
      type: args.type,
      channel: args.channel,
      enabled: args.enabled,
      updatedByUserId: actor.user.docId,
      updatedAt: now,
    });
  }

  const entry = getNotificationCatalogEntry(args.type);
  await deps.auditLogs.insert({
    action: "system_admin_notification_setting_changed",
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "notification_setting",
    targetId: `${args.type}:${args.channel}`,
    targetDisplayNameSnapshot: `${entry.label}（${NOTIFICATION_CHANNEL_LABELS[args.channel]}）`,
    reason,
    beforeNotificationEnabled: before,
    afterNotificationEnabled: args.enabled,
    result: "success",
    createdAt: now,
  });

  return { changed: true, enabled: args.enabled };
}
