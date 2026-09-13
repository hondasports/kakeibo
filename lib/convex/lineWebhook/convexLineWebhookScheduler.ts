/**
 * LineWebhookScheduler の Convex 実装。
 * 予約先の internal 参照をこのアダプタへ隔離する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import { internal } from "../../../convex/_generated/api";
import type { LineWebhookScheduler } from "../../domain/lineWebhook/scheduler";

export function createLineWebhookScheduler(
  ctx: Pick<MutationCtx, "scheduler">,
): LineWebhookScheduler {
  return {
    scheduleSummaryReply: async (args) => {
      await ctx.scheduler.runAfter(0, internal.lineWebhook.actions.sendSummaryReply, args);
    },
    scheduleUnlinkedGuide: async (args) => {
      await ctx.scheduler.runAfter(0, internal.lineWebhook.actions.sendUnlinkedGuide, args);
    },
    scheduleProcessLinkedImage: async (args) => {
      await ctx.scheduler.runAfter(0, internal.lineWebhook.image.processLinkedImage, args);
    },
    scheduleCleanup: async () => {
      await ctx.scheduler.runAfter(0, internal.lineWebhook.cleanup.cleanupOldEvents, {});
    },
  };
}
