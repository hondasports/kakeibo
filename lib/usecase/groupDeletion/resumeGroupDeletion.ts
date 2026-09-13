/**
 * グループ削除ジョブ再開ユースケース（internalMutation / 公開mutation共通）。
 * failed ジョブのみ再開可能。グループ状態・並列アクティブジョブを検証し、ジョブを requested に戻して再スケジュールする。
 */
import { ConvexError } from "convex/values";
import {
  evaluateResumeEligibility,
  resumeResetPatch,
} from "../../domain/groupDeletion/jobTransitions";
import type { GroupDeletionMutationDeps } from "./deps";

export async function resumeGroupDeletion(
  deps: Pick<GroupDeletionMutationDeps, "jobs" | "groups" | "scheduler">,
  args: { jobId: string },
): Promise<null> {
  const job = await deps.jobs.get(args.jobId);
  if (job === null || job.status !== "failed") {
    throw new ConvexError("failed状態の削除ジョブだけを再開できます");
  }

  const groupId = deps.jobs.resolveGroupId(job.targetGroupIdSnapshot);
  const group = groupId === null ? null : await deps.groups.get(groupId);

  const eligibility = evaluateResumeEligibility(job, {
    groupMissing: group === null,
    groupStatus: group?.status,
    hasActiveJobForTarget: false,
  });
  if (eligibility.kind === "group_state_invalid") {
    throw new ConvexError("deleting状態のグループに対する削除ジョブだけを再開できます");
  }

  const activeJob = await deps.jobs.findActiveByTargetSnapshot(job.targetGroupIdSnapshot);
  if (activeJob !== null) {
    throw new ConvexError("このグループの削除処理はすでに開始されています");
  }

  await deps.jobs.patch(job.id, resumeResetPatch(Date.now()));
  await deps.scheduler.scheduleBatch(job.id);
  return null;
}
