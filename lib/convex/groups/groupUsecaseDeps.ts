/**
 * groups ユースケースの依存組み立て（composition root）。
 * ctx に束縛したポート実装をまとめて返す。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { createAccountDeletionGuard } from "./convexAccountDeletionGuard";
import { createGroupOwnerTransitionGuard } from "./convexGroupOwnerTransitionGuard";
import { createGroupRepository, createGroupReadRepository } from "./convexGroupRepository";
import {
  createGroupMembershipRepository,
  createGroupMembershipReadRepository,
} from "./convexGroupMembershipRepository";
import { createUserDirectory, createUserDirectoryRead } from "./convexUserDirectory";
import {
  createGroupInvitationRepository,
  createGroupInvitationReadRepository,
} from "./convexGroupInvitationRepository";
import {
  createManagementAuditLogReadRepository,
  createManagementAuditLogRecorder,
} from "./convexManagementAuditLog";
import { createGroupEmailNotificationQueue } from "./convexGroupEmailNotifications";
import { createGroupInvitationCleanupService } from "./convexGroupInvitationCleanup";
import {
  createGroupDeletionJobReader,
  createGroupDeletionQueryService,
  createGroupDeletionWorkflowService,
} from "../groupDeletion/convexGroupDeletionWorkflow";

export function createGroupMutationDeps(ctx: MutationCtx) {
  return {
    groups: createGroupRepository(ctx),
    memberships: createGroupMembershipRepository(ctx),
    users: createUserDirectory(ctx),
    invitations: createGroupInvitationRepository(ctx),
    auditLog: createManagementAuditLogRecorder(ctx),
    emailQueue: createGroupEmailNotificationQueue(ctx),
    accountDeletion: createAccountDeletionGuard(ctx),
    ownerTransition: createGroupOwnerTransitionGuard(ctx),
    invitationCleanup: createGroupInvitationCleanupService(ctx),
    deletionJobs: createGroupDeletionJobReader(ctx),
    deletionWorkflow: createGroupDeletionWorkflowService(ctx),
  };
}

/** query 系ユースケースが必要とする読み取りポートのみを組み立てる。 */
export function createGroupQueryDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    users: createUserDirectoryRead(ctx),
    invitations: createGroupInvitationReadRepository(ctx),
    auditLogs: createManagementAuditLogReadRepository(ctx),
    deletionJobs: createGroupDeletionJobReader(ctx),
    deletionQuery: createGroupDeletionQueryService(ctx),
  };
}
