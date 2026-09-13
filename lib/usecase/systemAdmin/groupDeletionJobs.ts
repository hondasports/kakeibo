/**
 * listGroupDeletionJobs / resumeGroupDeletion ユースケース。
 */
import { ConvexError } from "convex/values";
import {
  getNormalizeReasonErrorMessage,
  normalizeSystemAdminReason,
} from "../../domain/systemAdmin/reason";
import { sanitizeGroupDeletionErrorCategory } from "../../domain/systemAdmin/groupDeletion";
import type { GroupDeletionJobStatus } from "../../domain/groupDeletion/groupDeletionJob";
import type { PaginationOpts } from "../../domain/pagination";
import type { SystemAdminMutationDeps, SystemAdminQueryDeps } from "./deps";
import { requireSystemAdminActor } from "./actor";

export async function listGroupDeletionJobs(
  deps: Pick<SystemAdminQueryDeps, "admins" | "users" | "groupDeletionJobs">,
  args: {
    tokenIdentifier: string;
    paginationOpts: PaginationOpts;
    status?: GroupDeletionJobStatus;
    environment: string;
  },
) {
  await requireSystemAdminActor(deps, args.tokenIdentifier);
  const jobs = await deps.groupDeletionJobs.paginate({ status: args.status }, args.paginationOpts);
  return {
    environment: args.environment,
    continueCursor: jobs.continueCursor,
    isDone: jobs.isDone,
    page: jobs.page.map((job) => ({
      jobId: job.id,
      targetGroupIdSnapshot: job.targetGroupIdSnapshot,
      targetGroupNameSnapshot: job.targetGroupNameSnapshot,
      source: job.source,
      status: job.status,
      stage: job.stage,
      isActive: job.isActive,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextRetryAt: job.nextRetryAt,
      lastErrorCategory: sanitizeGroupDeletionErrorCategory(job.lastErrorCategory),
      deletedCounts: job.deletedCounts,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    })),
  };
}

export async function resumeGroupDeletionForSystemAdmin(
  deps: Pick<
    SystemAdminMutationDeps,
    "admins" | "users" | "groupDeletionJobs" | "groupDeletionWorkflow" | "auditLogs"
  >,
  args: { tokenIdentifier: string; jobId: string; reason: string },
): Promise<null> {
  const actor = await requireSystemAdminActor(deps, args.tokenIdentifier);
  const reasonResult = normalizeSystemAdminReason(args.reason);
  if (!reasonResult.success) {
    throw new ConvexError(getNormalizeReasonErrorMessage(reasonResult.error));
  }
  const reason = reasonResult.reason;
  const job = await deps.groupDeletionJobs.get(args.jobId);
  if (job === null) throw new ConvexError("削除ジョブが見つかりません");
  await deps.groupDeletionWorkflow.resume({ jobId: args.jobId });
  await deps.auditLogs.insert({
    action: "system_admin_group_deletion_resumed",
    actorType: "system_admin",
    actorUserId: actor.user.docId,
    targetKind: "group",
    targetId: job.targetGroupIdSnapshot,
    targetDisplayNameSnapshot: job.targetGroupNameSnapshot,
    reason,
    result: "success",
    createdAt: Date.now(),
  });
  return null;
}
