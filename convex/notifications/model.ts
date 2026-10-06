import { v } from "convex/values";
import { transactionalEmailTypeValidator } from "../email/model";

export const NOTIFICATION_CHANNELS = ["email", "line"] as const;

export const notificationChannelValidator = v.union(v.literal("email"), v.literal("line"));

export const LINE_NOTIFICATION_JOB_STATUSES = [
  "queued",
  "processing",
  "retrying",
  "sent",
  "suppressed",
  "failed",
] as const;

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
