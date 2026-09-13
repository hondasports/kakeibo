import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createGroupDeletionMutationDeps } from "../../../lib/convex/groupDeletion/groupDeletionDeps";
import { startGroupDeletion } from "../../../lib/usecase/groupDeletion/startGroupDeletion";
import type { GroupDeletionJobSource } from "../../../lib/domain/groupDeletion/groupDeletionJob";

export async function startGroupDeletionHandler(
  ctx: MutationCtx,
  args: {
    groupId: Id<"groups">;
    source: GroupDeletionJobSource;
    actorUserIdSnapshot?: string;
  },
) {
  return (await startGroupDeletion(createGroupDeletionMutationDeps(ctx), {
    groupId: args.groupId,
    source: args.source,
    actorUserIdSnapshot: args.actorUserIdSnapshot,
  })) as Id<"groupDeletionJobs">;
}
