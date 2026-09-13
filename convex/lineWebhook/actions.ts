import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { createLineWebhookActionDeps } from "../../lib/convex/lineWebhook/lineWebhookDeps";
import { sendSummaryReply as sendSummaryReplyUseCase } from "../../lib/usecase/lineWebhook/sendSummaryReply";
import { sendUnlinkedGuide as sendUnlinkedGuideUseCase } from "../../lib/usecase/lineWebhook/sendUnlinkedGuide";
import { LINE_UNLINKED_GUIDANCE_MESSAGE } from "./client";

export async function sendUnlinkedGuideHandler(
  ctx: ActionCtx,
  args: { replyToken: string; attempt?: number },
) {
  return await sendUnlinkedGuideUseCase(createLineWebhookActionDeps(ctx), args);
}

export const sendUnlinkedGuide = internalAction({
  args: { replyToken: v.string(), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: sendUnlinkedGuideHandler,
});

export async function sendSummaryReplyHandler(
  ctx: ActionCtx,
  args: {
    replyToken: string;
    userId: string;
    messageText: string;
    nowMs: number;
    attempt?: number;
  },
) {
  return await sendSummaryReplyUseCase(createLineWebhookActionDeps(ctx), args);
}

export const sendSummaryReply = internalAction({
  args: {
    replyToken: v.string(),
    userId: v.string(),
    messageText: v.string(),
    nowMs: v.number(),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: sendSummaryReplyHandler,
});

export { LINE_UNLINKED_GUIDANCE_MESSAGE };
