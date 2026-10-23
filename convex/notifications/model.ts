import { NOTIFICATION_CHANNELS } from "../../lib/domain/notifications/model";
import { LINE_NOTIFICATION_JOB_STATUSES } from "../../lib/domain/notifications/records";
export { NOTIFICATION_CHANNELS } from "../../lib/domain/notifications/model";
export { LINE_NOTIFICATION_JOB_STATUSES } from "../../lib/domain/notifications/records";
import { v } from "convex/values";
import { transactionalEmailTypeValidator } from "../email/model";

export const notificationChannelValidator = v.union(
  ...NOTIFICATION_CHANNELS.map((value) => v.literal(value)),
);

export const lineNotificationJobStatusValidator = v.union(
  ...LINE_NOTIFICATION_JOB_STATUSES.map((s) => v.literal(s)),
);

export const notificationPreferencesValidator = v.object({
  aiReviewRequiredEmailEnabled: v.boolean(),
  aiReviewRequiredLineEnabled: v.boolean(),
});

export const myNotificationSettingsValidator = v.object({
  emailEnabled: v.boolean(),
  lineEnabled: v.boolean(),
  lineLinked: v.boolean(),
  emailGloballyEnabled: v.boolean(),
  lineGloballyEnabled: v.boolean(),
});

export const adminNotificationSettingItemValidator = v.object({
  type: transactionalEmailTypeValidator,
  channel: notificationChannelValidator,
  typeLabel: v.string(),
  channelLabel: v.string(),
  mandatory: v.boolean(),
  enabled: v.boolean(),
  configured: v.boolean(),
  updatedAt: v.optional(v.number()),
});
