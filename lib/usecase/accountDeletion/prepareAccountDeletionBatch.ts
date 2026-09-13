/**
 * 退会準備バッチ（internalMutation）。
 * ユーザーの membership を 25 件ずつ評価し、共有グループの離脱と
 * sole-owner グループの bounded purge job 作成を行う。
 */
import type { AccountDeletionMutationDeps } from "./deps";

const GROUP_BATCH_SIZE = 25;

export async function prepareAccountDeletionBatch(
  deps: Pick<
    AccountDeletionMutationDeps,
    | "requests"
    | "purges"
    | "memberships"
    | "groups"
    | "users"
    | "groupDeletionJobs"
    | "groupDeletionWorkflow"
    | "invitationCleanup"
    | "scheduler"
  >,
  args: { requestId: string },
): Promise<void> {
  const request = await deps.requests.get(args.requestId);
  if (
    !request ||
    request.status === "completed" ||
    request.status === "failed" ||
    request.status === "deleting_identity" ||
    request.status === "identity_deleted" ||
    request.status === "finalization_retry_wait"
  ) {
    return;
  }
  const page = await deps.memberships.paginateByUser(
    request.userId,
    request.preparationCursor ?? null,
    GROUP_BATCH_SIZE,
  );
  const user = await deps.users.findByUserId(request.userId);
  for (const membership of page.page) {
    const group = await deps.groups.get(membership.groupId);
    if (!group) {
      await deps.memberships.delete(membership.id);
      continue;
    }
    const members = await deps.memberships.listByGroup(membership.groupId, 10_000);
    const memberCount = members.length;
    const ownerCount = members.filter((row) => row.role === "owner").length;
    if (membership.role === "member" || ownerCount >= 2) {
      await deps.memberships.delete(membership.id);
      if (user?.email) {
        await deps.invitationCleanup.revokeForEmail(membership.groupId, user.email);
      }
      continue;
    }
    if (memberCount !== 1) {
      await deps.requests.patch(args.requestId, {
        status: "failed",
        lastErrorCode: "account_deletion_blocked_by_membership_change",
        lastErrorMessage: "グループの所有者状態が変わったため退会処理を停止しました。",
        updatedAt: Date.now(),
      });
      return;
    }
    const targetGroupIdSnapshot = membership.groupId.toString();
    const activeJob =
      await deps.groupDeletionJobs.findActiveByTargetSnapshot(targetGroupIdSnapshot);
    if (activeJob && activeJob.source !== "account_deletion") {
      await deps.requests.patch(args.requestId, {
        status: "failed",
        lastErrorCode: "group_deletion_conflict",
        lastErrorMessage: "グループの別の削除処理と競合したため退会処理を停止しました。",
        updatedAt: Date.now(),
      });
      return;
    }
    const jobId =
      activeJob !== null
        ? activeJob.id
        : await deps.groupDeletionWorkflow.start({
            groupId: membership.groupId,
            source: "account_deletion",
          });
    const existingRelation = await deps.purges.findByGroupDeletionJobId(jobId);
    if (!existingRelation) {
      const now = Date.now();
      await deps.purges.insert({
        requestId: args.requestId,
        groupDeletionJobId: jobId,
        targetGroupIdSnapshot,
        targetGroupNameSnapshot: group.name,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const now = Date.now();
  if (page.isDone) {
    await deps.requests.patch(args.requestId, {
      status: "purging_groups",
      preparationCursor: undefined,
      preparationCompletedAt: now,
      updatedAt: now,
    });
    await deps.scheduler.scheduleProcess(args.requestId);
  } else {
    await deps.requests.patch(args.requestId, {
      status: "preparing_groups",
      preparationCursor: page.continueCursor,
      updatedAt: now,
    });
    await deps.scheduler.schedulePrepareBatch(args.requestId);
  }
}
