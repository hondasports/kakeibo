import { v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSystemAdmin } from "./systemAdmins";
import { transactionalEmailTypeValidator } from "./email/model";
import {
  adminNotificationSettingItemValidator,
  notificationChannelValidator,
} from "./notifications/model";
import {
  createNotificationAdminMutationDeps,
  createNotificationAdminQueryDeps,
} from "../lib/convex/notifications/notificationDeps";
import {
  listNotificationSettings as listNotificationSettingsUsecase,
  updateNotificationSetting as updateNotificationSettingUsecase,
} from "../lib/usecase/notifications/adminSettings";

const listResultValidator = v.object({
  items: v.array(adminNotificationSettingItemValidator),
});

export const getNotificationSettings = query({
  args: {},
  returns: listResultValidator,
  handler: async (ctx) => {
    const { identity } = await requireSystemAdmin(ctx);
    return (await listNotificationSettingsUsecase(
      createNotificationAdminQueryDeps(ctx),
      identity.tokenIdentifier,
    )) as Infer<typeof listResultValidator>;
  },
});

export const updateNotificationSetting = mutation({
  args: {
    type: transactionalEmailTypeValidator,
    channel: notificationChannelValidator,
    enabled: v.boolean(),
    reason: v.string(),
    confirmMandatoryEmailDisable: v.optional(v.boolean()),
  },
  returns: v.object({
    changed: v.boolean(),
    enabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { identity } = await requireSystemAdmin(ctx);
    return await updateNotificationSettingUsecase(createNotificationAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      type: args.type,
      channel: args.channel,
      enabled: args.enabled,
      reason: args.reason,
      confirmMandatoryEmailDisable: args.confirmMandatoryEmailDisable,
    });
  },
});
