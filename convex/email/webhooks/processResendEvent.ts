import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import type { EmailWebhookEventType } from "../../../lib/email/model";
import { processResendEvent as processResendEventUsecase } from "../../../lib/usecase/email/processResendEvent";
import { createProcessResendEventDeps } from "../../../lib/convex/email/emailDeps";
import { emailWebhookEventTypeValidator } from "../model";

export async function processResendEventHandler(
  ctx: MutationCtx,
  args: {
    svixId: string;
    provider: string;
    eventType: EmailWebhookEventType;
    payloadJson: string;
    processedAt: number;
  },
): Promise<void> {
  return await processResendEventUsecase(createProcessResendEventDeps(ctx), args);
}

export const processResendEvent = internalMutation({
  args: {
    svixId: v.string(),
    provider: v.string(),
    eventType: emailWebhookEventTypeValidator,
    payloadJson: v.string(),
    processedAt: v.number(),
  },
  handler: processResendEventHandler,
});

export { resolveStatusAndSuppression } from "../../../lib/domain/email/webhook";
