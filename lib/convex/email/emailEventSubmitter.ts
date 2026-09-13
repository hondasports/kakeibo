import { internal } from "../../../convex/_generated/api";
import type { ActionCtx } from "../../../convex/_generated/server";
import type { ResendEventSubmitter } from "../../domain/email/runner";
import type { EmailWebhookEventType } from "../../email/model";

export function createResendEventSubmitter(
  ctx: Pick<ActionCtx, "runMutation">,
): ResendEventSubmitter {
  return {
    async submit(args) {
      await ctx.runMutation(internal.email.webhooks.processResendEvent.processResendEvent, {
        svixId: args.svixId,
        provider: args.provider,
        eventType: args.eventType as EmailWebhookEventType,
        payloadJson: args.payloadJson,
        processedAt: args.processedAt,
      });
    },
  };
}
