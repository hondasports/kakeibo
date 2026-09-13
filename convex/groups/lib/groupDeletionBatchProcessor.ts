import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { processGroupDeletionBatch } from "../../../lib/usecase/groupDeletion/processGroupDeletionBatch";

export async function processGroupDeletionBatchHandler(
  ctx: MutationCtx,
  args: { jobId: Id<"groupDeletionJobs"> },
): Promise<null> {
  return await processGroupDeletionBatch(createGroupDeletionMutationDeps(ctx), {
    jobId: args.jobId,
  });
}
