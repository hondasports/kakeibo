/**
 * accountDeletion ユースケースの依存組み立て（composition root）。
 * ctx に束縛したポート実装をまとめて返す。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import {
  createAccountDeletionRequestReader,
  createAccountDeletionRequestStore,
} from "./convexAccountDeletionRequestStore";
import {
  createAccountDeletionGroupPurgeStore,
  createAccountDeletionUserDataPurgeStore,
} from "./convexAccountDeletionPurgeStore";
import { createAccountDeletionScheduler } from "./convexAccountDeletionScheduler";
import { createGroupDeletionJobStore } from "../groupDeletion/convexGroupDeletionJobStore";
import { createGroupDeletionWorkflowService } from "../groupDeletion/convexGroupDeletionWorkflow";
import {
  createGroupMembershipReadRepository,
  createGroupMembershipRepository,
} from "../groups/convexGroupMembershipRepository";
import { createGroupReadRepository } from "../groups/convexGroupRepository";
import { createUserDirectory, createUserDirectoryRead } from "../groups/convexUserDirectory";
import { createGroupInvitationCleanupService } from "../groups/convexGroupInvitationCleanup";
import { createTransactionalEmailQueue } from "../email/convexTransactionalEmailQueue";

export function createAccountDeletionMutationDeps(ctx: MutationCtx) {
  return {
    requests: createAccountDeletionRequestStore(ctx),
    purges: createAccountDeletionGroupPurgeStore(ctx),
    userData: createAccountDeletionUserDataPurgeStore(ctx),
    scheduler: createAccountDeletionScheduler(ctx),
    memberships: createGroupMembershipRepository(ctx),
    groups: createGroupReadRepository(ctx),
    users: createUserDirectory(ctx),
    groupDeletionJobs: createGroupDeletionJobStore(ctx),
    groupDeletionWorkflow: createGroupDeletionWorkflowService(ctx),
    invitationCleanup: createGroupInvitationCleanupService(ctx),
    emailQueue: createTransactionalEmailQueue(ctx),
  };
}

/** 読み取り専用コンテキスト（query）向けの依存組み立て。 */
export function createAccountDeletionQueryDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    requests: createAccountDeletionRequestReader(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    groups: createGroupReadRepository(ctx),
    users: createUserDirectoryRead(ctx),
  };
}
