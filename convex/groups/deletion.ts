import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireGroupOwner } from "./membership";
import { groupDeletionPreviewValidator } from "./validators";
import { requireAuthenticatedUserId } from "../users/auth";
import { groupDeletionStatusValidator } from "./lib/groupDeletionJobModel";
import { getGroupDeletionPreview as getGroupDeletionPreviewUsecase } from "../../lib/usecase/groups/getGroupDeletionPreview";
import { requestGroupDeletion as requestGroupDeletionUsecase } from "../../lib/usecase/groups/requestGroupDeletion";
import { getGroupDeletionStatus as getGroupDeletionStatusUsecase } from "../../lib/usecase/groups/getGroupDeletionStatus";
import { resumeGroupDeletion as resumeGroupDeletionUsecase } from "../../lib/usecase/groups/resumeGroupDeletion";
import {
  createGroupMutationDeps,
  createGroupQueryDeps,
} from "../../lib/convex/groups/groupUsecaseDeps";

export async function getGroupDeletionPreviewHandler(ctx: QueryCtx) {
  const { groupId } = await requireGroupOwner(ctx);
  return await getGroupDeletionPreviewUsecase({ groupId }, createGroupQueryDeps(ctx));
}

export async function requestGroupDeletionHandler(
  ctx: MutationCtx,
  args: { confirmationGroupName: string },
) {
  const { groupId, userId } = await requireGroupOwner(ctx);
  const jobId = await requestGroupDeletionUsecase(
    { groupId, userId },
    createGroupMutationDeps(ctx),
    args,
  );
  return jobId as Id<"groupDeletionJobs">;
}

export const getGroupDeletionPreview = query({
  args: {},
  returns: groupDeletionPreviewValidator,
  handler: getGroupDeletionPreviewHandler,
});

export const requestGroupDeletion = mutation({
  args: { confirmationGroupName: v.string() },
  returns: v.id("groupDeletionJobs"),
  handler: requestGroupDeletionHandler,
});

const publicGroupDeletionStatusValidator = v.object({
  jobId: v.id("groupDeletionJobs"),
  groupName: v.string(),
  status: groupDeletionStatusValidator,
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
});

export const getGroupDeletionStatus = query({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.union(v.null(), publicGroupDeletionStatusValidator),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const result = await getGroupDeletionStatusUsecase({ userId }, createGroupQueryDeps(ctx), args);
    if (result === null) return null;
    return {
      jobId: result.jobId as Id<"groupDeletionJobs">,
      groupName: result.groupName,
      status: result.status,
      updatedAt: result.updatedAt,
      completedAt: result.completedAt,
    };
  },
});

export const resumeGroupDeletion = mutation({
  args: { jobId: v.id("groupDeletionJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    return await resumeGroupDeletionUsecase({ userId }, createGroupMutationDeps(ctx), args);
  },
});
