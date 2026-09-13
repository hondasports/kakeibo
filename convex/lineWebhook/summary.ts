import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { LineReplyKind } from "../../lib/domain/lineSummary/quickReply";
import { createLineWebhookQueryDeps } from "../../lib/convex/lineWebhook/lineWebhookDeps";
import { buildSummaryReply } from "../../lib/usecase/lineWebhook/buildSummaryReply";

const lineReplyKindValidator = v.union(
  v.literal("unlinked"),
  v.literal("unavailable"),
  v.literal("no_group"),
  v.literal("unresolved"),
  v.literal("help"),
  v.literal("week_summary"),
  v.literal("week_expense"),
  v.literal("week_income"),
  v.literal("week_categories"),
  v.literal("week_trend"),
  v.literal("category_lookup"),
  v.literal("receipt_guide"),
);

const summaryReplyValidator = v.object({
  replyText: v.string(),
  replyKind: lineReplyKindValidator,
});

export async function buildSummaryReplyHandler(
  ctx: QueryCtx,
  args: { userId: string; messageText: string; nowMs: number },
): Promise<{ replyText: string; replyKind: LineReplyKind }> {
  return await buildSummaryReply(createLineWebhookQueryDeps(ctx), args);
}

export const buildReply = internalQuery({
  args: {
    userId: v.string(),
    messageText: v.string(),
    nowMs: v.number(),
  },
  returns: summaryReplyValidator,
  handler: buildSummaryReplyHandler,
});
