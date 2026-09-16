import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { emailSuppressionReasonValidator } from "./model";
import type { EmailSuppressionReason } from "../../lib/email/model";
import { getEmailSuppressionDocByNormalizedEmail } from "../../lib/convex/email/convexEmailSuppressionStore";
import { upsertEmailSuppression } from "../../lib/usecase/email/suppressions";
import { createSuppressionDeps } from "../../lib/convex/email/emailDeps";

export const getSuppressionByNormalizedEmail = internalQuery({
  args: { normalizedEmail: v.string() },
  handler: async (ctx, { normalizedEmail }) => {
    return await getEmailSuppressionDocByNormalizedEmail(ctx, normalizedEmail);
  },
});

export async function upsertSuppressionHandler(
  ctx: MutationCtx,
  args: {
    email: string;
    normalizedEmail: string;
    reason: EmailSuppressionReason;
    source?: string;
    providerMessageId?: string;
    createdAt: number;
  },
): Promise<string> {
  return await upsertEmailSuppression(createSuppressionDeps(ctx), args);
}

export const upsertSuppression = internalMutation({
  args: {
    email: v.string(),
    normalizedEmail: v.string(),
    reason: emailSuppressionReasonValidator,
    source: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: upsertSuppressionHandler,
});
