import { internalMutation } from "../_generated/server";
import { createLineWebhookMutationDeps } from "../../lib/convex/lineWebhook/lineWebhookDeps";
import { cleanupOldEvents as cleanupOldEventsUseCase } from "../../lib/usecase/lineWebhook/cleanupOldEvents";

export { LINE_WEBHOOK_EVENT_RETENTION_DAYS } from "../../lib/usecase/lineWebhook/cleanupOldEvents";

export const cleanupOldEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    await cleanupOldEventsUseCase(createLineWebhookMutationDeps(ctx));
  },
});
