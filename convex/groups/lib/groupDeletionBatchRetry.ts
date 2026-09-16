import type { MutationCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { groupDeletionJobDocToRecord } from "../../../lib/convex/groupDeletion/convexGroupDeletionJobStore";
import { recordBatchRetry } from "../../../lib/usecase/groupDeletion/recordBatchRetry";

export async function recordRetry(ctx: MutationCtx, job: Doc<"groupDeletionJobs">): Promise<void> {
  await recordBatchRetry(createGroupDeletionMutationDeps(ctx), groupDeletionJobDocToRecord(job));
}
