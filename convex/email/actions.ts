"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { processEmailJob as processEmailJobUsecase } from "../../lib/usecase/email/processJob";
import { createProcessEmailJobDeps } from "../../lib/convex/email/emailDeps";

export async function processEmailJobHandler(
  ctx: ActionCtx,
  { jobId }: { jobId: Id<"transactionalEmailJobs"> },
): Promise<void> {
  return await processEmailJobUsecase(createProcessEmailJobDeps(ctx), { jobId });
}

export const processEmailJob = internalAction({
  args: {
    jobId: v.id("transactionalEmailJobs"),
  },
  handler: processEmailJobHandler,
});
