import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { createLineWebhookActionDeps } from "../../lib/convex/lineWebhook/lineWebhookDeps";
import { getLineMessageContent } from "./client";
import {
  buildLinkedImageReply as buildLinkedImageReplyUseCase,
  processLinkedImage as processLinkedImageUseCase,
} from "../../lib/usecase/lineWebhook/processLinkedImage";

type ProcessLinkedImageArgs = {
  replyToken: string;
  userId: string;
  webhookEventId: string;
  messageId: string;
  attempt?: number;
};

function withContentReader(ctx: ActionCtx, getContent: typeof getLineMessageContent) {
  return {
    ...createLineWebhookActionDeps(ctx),
    contentReader: { getMessageContent: getContent },
  };
}

export async function buildLinkedImageReply(
  ctx: ActionCtx,
  args: ProcessLinkedImageArgs,
  getContent: typeof getLineMessageContent = getLineMessageContent,
): Promise<string> {
  return await buildLinkedImageReplyUseCase(withContentReader(ctx, getContent), args);
}

export async function processLinkedImageHandler(
  ctx: ActionCtx,
  args: ProcessLinkedImageArgs,
  getContent: typeof getLineMessageContent = getLineMessageContent,
) {
  return await processLinkedImageUseCase(withContentReader(ctx, getContent), args);
}

export const processLinkedImage = internalAction({
  args: {
    replyToken: v.string(),
    userId: v.string(),
    webhookEventId: v.string(),
    messageId: v.string(),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: processLinkedImageHandler,
});
