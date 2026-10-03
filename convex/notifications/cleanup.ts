import { internalMutation } from "../_generated/server";
import { cleanupOldLineNotificationJobs as cleanupUsecase } from "../../lib/usecase/notifications/cleanup";
import { createCleanupLineNotificationDeps } from "../../lib/convex/notifications/notificationDeps";

export const cleanupOldLineNotificationJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    await cleanupUsecase(createCleanupLineNotificationDeps(ctx));
  },
});
