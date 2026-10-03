import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { notificationChannelValidator } from "./model";
import { requireAuthenticatedUserId } from "../users/auth";
import { updateMyNotificationPreference as updateMyNotificationPreferenceUsecase } from "../../lib/usecase/notifications/mySettings";
import { createNotificationUserMutationDeps } from "../../lib/convex/notifications/notificationDeps";
import { AI_REVIEW_REQUIRED_NOTIFICATION_TYPE } from "../../lib/domain/notifications/model";

export const updateMyNotificationPreference = mutation({
  args: {
    type: v.literal(AI_REVIEW_REQUIRED_NOTIFICATION_TYPE),
    channel: notificationChannelValidator,
    enabled: v.boolean(),
  },
  returns: v.object({
    emailEnabled: v.boolean(),
    lineEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await updateMyNotificationPreferenceUsecase(
      createNotificationUserMutationDeps(ctx),
      userId,
      { channel: args.channel, enabled: args.enabled },
      Date.now(),
    );
  },
});
