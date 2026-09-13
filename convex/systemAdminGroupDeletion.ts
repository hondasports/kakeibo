import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  groupDeletionCountsValidator,
  groupDeletionSourceValidator,
  groupDeletionStageValidator,
  groupDeletionStatusValidator,
} from "./groups/lib/groupDeletionJobModel";
import { resolveAppEnvironment } from "../lib/domain/systemAdmin/environment";
import {
  createSystemAdminMutationDeps,
  createSystemAdminQueryDeps,
} from "../lib/convex/systemAdmin/systemAdminDeps";
import {
  listGroupDeletionJobs as listGroupDeletionJobsUsecase,
  resumeGroupDeletionForSystemAdmin,
} from "../lib/usecase/systemAdmin";

const statusFilterValidator = v.optional(groupDeletionStatusValidator);

const groupDeletionItemValidator = v.object({
  jobId: v.id("groupDeletionJobs"),
  targetGroupIdSnapshot: v.string(),
  targetGroupNameSnapshot: v.string(),
  source: groupDeletionSourceValidator,
  status: groupDeletionStatusValidator,
  stage: groupDeletionStageValidator,
  isActive: v.boolean(),
  attemptCount: v.number(),
  maxAttempts: v.number(),
  nextRetryAt: v.optional(v.number()),
  lastErrorCategory: v.optional(v.string()),
  deletedCounts: groupDeletionCountsValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
});
const listResultValidator = v.object({
  ...paginationResultValidator(groupDeletionItemValidator).fields,
  environment: v.string(),
});

export const listGroupDeletionJobs = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: statusFilterValidator,
  },
  returns: listResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    const envResult = resolveAppEnvironment(process.env.APP_ENV);
    const environment = envResult.success ? envResult.environment : "development";
    return (await listGroupDeletionJobsUsecase(createSystemAdminQueryDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      paginationOpts: args.paginationOpts,
      status: args.status,
      environment,
    })) as Infer<typeof listResultValidator>;
  },
});

export const resumeGroupDeletion = mutation({
  args: { jobId: v.id("groupDeletionJobs"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("システム管理者権限が必要です");
    return await resumeGroupDeletionForSystemAdmin(createSystemAdminMutationDeps(ctx), {
      tokenIdentifier: identity.tokenIdentifier,
      jobId: args.jobId,
      reason: args.reason,
    });
  },
});

export type SystemAdminGroupDeletionJobId = Id<"groupDeletionJobs">;
