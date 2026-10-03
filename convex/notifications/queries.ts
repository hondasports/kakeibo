import { query } from "../_generated/server";
import { myNotificationSettingsValidator } from "./model";
import { requireAuthenticatedUserId } from "../users/auth";
import { getMyNotificationSettings as getMyNotificationSettingsUsecase } from "../../lib/usecase/notifications/mySettings";
import { createNotificationUserQueryDeps } from "../../lib/convex/notifications/notificationDeps";

export const getMyNotificationSettings = query({
  args: {},
  returns: myNotificationSettingsValidator,
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await getMyNotificationSettingsUsecase(createNotificationUserQueryDeps(ctx), userId);
  },
});
