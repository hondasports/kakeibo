import { isActiveAccountDeletionStatus } from "../../domain/accountDeletion/status";
import type { AccountDeletionRequestReader } from "../../domain/accountDeletion/request";
import type { TransactionalEmailType } from "../../email/model";
import {
  AI_REVIEW_REQUIRED_NOTIFICATION_TYPE,
  defaultNotificationEnabled,
  resolveNotificationDelivery,
  type NotificationDeliveryDecision,
} from "../../domain/notifications/model";
import type { NotificationSettingReader } from "../../domain/notifications/store";
import type { UserStore } from "../../domain/users/store";

export type EmailDeliveryDecisionDeps = {
  settings: NotificationSettingReader;
  users: Pick<UserStore, "findByUserId">;
  accountDeletionRequests: Pick<AccountDeletionRequestReader, "listByUser">;
};

export async function getEmailDeliveryDecision(
  deps: EmailDeliveryDecisionDeps,
  args: { type: TransactionalEmailType; userId?: string },
): Promise<NotificationDeliveryDecision> {
  const setting = await deps.settings.findByTypeAndChannel(args.type, "email");
  const globalEnabled = setting?.enabled ?? defaultNotificationEnabled(args.type, "email");

  if (!globalEnabled) {
    return resolveNotificationDelivery({
      type: args.type,
      channel: "email",
      globalEnabled,
    });
  }

  let personalEnabled: boolean | undefined;
  if (args.type === AI_REVIEW_REQUIRED_NOTIFICATION_TYPE && args.userId !== undefined) {
    const user = await deps.users.findByUserId(args.userId);
    if (!user) {
      return { enabled: false, reason: "user_deleted" };
    }
    const deletionRequests = await deps.accountDeletionRequests.listByUser(args.userId, 25);
    if (deletionRequests.some((request) => isActiveAccountDeletionStatus(request.status))) {
      return { enabled: false, reason: "user_deleting" };
    }
    personalEnabled = user.notificationPreferences?.aiReviewRequiredEmailEnabled;
  }

  return resolveNotificationDelivery({
    type: args.type,
    channel: "email",
    globalEnabled,
    personalEnabled,
  });
}
