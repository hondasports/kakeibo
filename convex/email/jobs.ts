import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { enqueueTransactionalEmailJob as enqueueTransactionalEmailJobUsecase } from "../../lib/usecase/email/enqueueJob";
import { createEnqueueJobDeps } from "../../lib/convex/email/emailDeps";
import { transactionalEmailTypeValidator } from "./model";
import type { TransactionalEmailType } from "../../lib/email/model";

export async function enqueueTransactionalEmailJobHandler(
  ctx: MutationCtx,
  args: {
    templateType: TransactionalEmailType;
    payloadJson: string;
    recipientEmail: string;
    businessDedupeKey?: string;
  },
): Promise<string> {
  return await enqueueTransactionalEmailJobUsecase(createEnqueueJobDeps(ctx), args);
}

export const enqueueTransactionalEmailJob = internalMutation({
  args: {
    templateType: transactionalEmailTypeValidator,
    payloadJson: v.string(),
    recipientEmail: v.string(),
    businessDedupeKey: v.optional(v.string()),
  },
  handler: enqueueTransactionalEmailJobHandler,
});
