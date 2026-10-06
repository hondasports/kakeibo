"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { processLineNotificationJob as processLineNotificationJobUsecase } from "../../lib/usecase/notifications/processLineJob";
import { createProcessLineNotificationJobDeps } from "../../lib/convex/notifications/notificationDeps";

export async function processLineNotificationJobHandler(
  ctx: ActionCtx,
  { jobId }: { jobId: Id<"lineNotificationJobs"> },
): Promise<void> {
  return await processLineNotificationJobUsecase(createProcessLineNotificationJobDeps(ctx), {
    jobId,
    retryKeyCandidate: randomUUID(),
  });
}

export const processLineNotificationJob = internalAction({
  args: {
    jobId: v.id("lineNotificationJobs"),
  },
  handler: processLineNotificationJobHandler,
});
