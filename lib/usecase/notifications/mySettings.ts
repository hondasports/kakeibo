import { ConvexError } from "convex/values";
import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import {
  AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  DEFAULT_USER_NOTIFICATION_PREFERENCES,
  defaultNotificationEnabled,
  type NotificationChannel,
  type UserNotificationPreferences,
} from "../../domain/notifications/model";
import type { NotificationUserMutationDeps, NotificationUserQueryDeps } from "./deps";

export type MyNotificationSettings = {
  emailEnabled: boolean;
  lineEnabled: boolean;
  lineLinked: boolean;
  emailGloballyEnabled: boolean;
  lineGloballyEnabled: boolean;
};

async function assertLiveUser(
  deps: Pick<NotificationUserQueryDeps, "users" | "accountDeletionRequests">,
  userId: string,
) {
  const user = await deps.users.findByUserId(userId);
  if (!user) throw new ConvexError("ユーザーが見つかりません");
  const requests = await deps.accountDeletionRequests.listByUser(userId, 25);
  if (requests.some((request) => isActiveAccountDeletionStatus(request.status))) {
    throw new ConvexError("退会処理中のため通知設定を利用できません");
  }
  return user;
}

export async function getMyNotificationSettings(
  deps: NotificationUserQueryDeps,
  userId: string,
): Promise<MyNotificationSettings> {
  const user = await assertLiveUser(deps, userId);
  const prefs = user.notificationPreferences;
  const [emailSetting, lineSetting, activeLinks] = await Promise.all([
    deps.settings.findByTypeAndChannel(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "email"),
    deps.settings.findByTypeAndChannel(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
    deps.links.listActiveByUserId(userId),
  ]);
  return {
    emailEnabled:
      prefs?.aiReviewRequiredEmailEnabled ??
      DEFAULT_USER_NOTIFICATION_PREFERENCES.aiReviewRequiredEmailEnabled,
    lineEnabled:
      prefs?.aiReviewRequiredLineEnabled ??
      DEFAULT_USER_NOTIFICATION_PREFERENCES.aiReviewRequiredLineEnabled,
    lineLinked: activeLinks.length === 1,
    emailGloballyEnabled:
      emailSetting?.enabled ??
      defaultNotificationEnabled(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "email"),
    lineGloballyEnabled:
      lineSetting?.enabled ??
      defaultNotificationEnabled(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE, "line"),
  };
}

export async function updateMyNotificationPreference(
  deps: NotificationUserMutationDeps,
  userId: string,
  args: { channel: NotificationChannel; enabled: boolean },
  now: number,
): Promise<{ emailEnabled: boolean; lineEnabled: boolean }> {
  const user = await assertLiveUser(deps, userId);

  if (args.channel === "line" && args.enabled) {
    const activeLinks = await deps.links.listActiveByUserId(userId);
    if (activeLinks.length !== 1) {
      throw new ConvexError("LINE通知を有効にするにはLINE連携が必要です");
    }
  }

  const current: UserNotificationPreferences = {
    aiReviewRequiredEmailEnabled:
      user.notificationPreferences?.aiReviewRequiredEmailEnabled ??
      DEFAULT_USER_NOTIFICATION_PREFERENCES.aiReviewRequiredEmailEnabled,
    aiReviewRequiredLineEnabled:
      user.notificationPreferences?.aiReviewRequiredLineEnabled ??
      DEFAULT_USER_NOTIFICATION_PREFERENCES.aiReviewRequiredLineEnabled,
  };
  const next: UserNotificationPreferences =
    args.channel === "email"
      ? { ...current, aiReviewRequiredEmailEnabled: args.enabled }
      : { ...current, aiReviewRequiredLineEnabled: args.enabled };

  await deps.users.patch(user.id, {
    notificationPreferences: next,
    updatedAt: now,
  });

  return {
    emailEnabled: next.aiReviewRequiredEmailEnabled,
    lineEnabled: next.aiReviewRequiredLineEnabled,
  };
}
