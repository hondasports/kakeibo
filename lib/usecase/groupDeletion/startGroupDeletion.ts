/**
 * グループ削除ジョブ開始ユースケース（internalMutation）。
 * 重複起動・対象グループ状態を検証し、ジョブ作成→グループを deleting 化→初回バッチをスケジュールする。
 */
import { ConvexError } from "convex/values";
import { zeroDeletedCounts } from "../../domain/groupDeletion/counts";
import { initialStageForJob } from "../../domain/groupDeletion/stages";
import { MAX_ATTEMPTS } from "../../domain/groupDeletion/constants";
import type { GroupDeletionJobSource } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionMutationDeps } from "./deps";

export async function startGroupDeletion(
  deps: Pick<GroupDeletionMutationDeps, "jobs" | "groups" | "scheduler">,
  args: {
    groupId: string;
    source: GroupDeletionJobSource;
    actorUserIdSnapshot?: string;
  },
): Promise<string> {
  const targetGroupIdSnapshot = args.groupId.toString();
  const activeJob = await deps.jobs.findActiveByTargetSnapshot(targetGroupIdSnapshot);
  if (activeJob !== null) {
    throw new ConvexError("このグループの削除処理はすでに開始されています");
  }

  const group = await deps.groups.get(args.groupId);
  if (group === null) {
    throw new ConvexError("削除対象のグループが見つかりません");
  }
  if (group.status === "deleting" || group.status === "deleted") {
    throw new ConvexError("このグループの削除処理はすでに開始されています");
  }
  if (group.status === "archived") {
    throw new ConvexError("アーカイブ済みグループは削除できません");
  }

  const now = Date.now();
  const jobId = await deps.jobs.insert({
    targetGroupIdSnapshot,
    targetGroupNameSnapshot: group.name,
    source: args.source,
    actorUserIdSnapshot: args.actorUserIdSnapshot,
    status: "requested",
    stage: initialStageForJob(args.source, args.actorUserIdSnapshot),
    isActive: true,
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    deletedCounts: zeroDeletedCounts(),
    createdAt: now,
    updatedAt: now,
  });

  await deps.groups.patch(args.groupId, {
    status: "deleting",
    updatedAt: now,
  });
  await deps.scheduler.scheduleBatch(jobId);
  return jobId;
}
