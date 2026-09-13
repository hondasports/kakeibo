import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { resumeGroupDeletion } from "../../../lib/usecase/groupDeletion/resumeGroupDeletion";

export async function resumeGroupDeletionHandler(
  ctx: MutationCtx,
  args: { jobId: Id<"groupDeletionJobs"> },
) {
  return await resumeGroupDeletion(createGroupDeletionMutationDeps(ctx), {
    jobId: args.jobId,
  });
}
