/**
 * グループ削除ステータス参照ユースケース（query）。
 * 本人が owner として開始したジョブのみ参照可能。
 */
import type { GroupDeletionJobReader } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionJobStatus } from "../../domain/groupDeletion/groupDeletionJob";
import type { UsecaseGroupContext } from "../context";

export type GroupDeletionStatusResult = {
  jobId: string;
  groupName: string;
  status: GroupDeletionJobStatus;
  updatedAt: number;
  completedAt?: number;
};

export async function getGroupDeletionStatus(
  ctx: Pick<UsecaseGroupContext, "userId">,
  deps: { deletionJobs: GroupDeletionJobReader },
  args: { jobId: string },
): Promise<GroupDeletionStatusResult | null> {
  const job = await deps.deletionJobs.get(args.jobId);
  if (job === null || job.actorUserIdSnapshot !== ctx.userId || job.source !== "owner") {
    return null;
  }
  return {
    jobId: job.id!,
    groupName: job.targetGroupNameSnapshot,
    status: job.status,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}
