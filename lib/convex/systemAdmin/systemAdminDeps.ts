/**
 * systemAdmin ユースケースの依存組み立て（composition root）。
 * ctx に束縛したポート実装をまとめて返す。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { createSystemAdminStore, createSystemAdminReadStore } from "./convexSystemAdminStore";
import {
  createSystemAdminAuditLogReader,
  createSystemAdminAuditLogStore,
} from "./convexSystemAdminAuditLogStore";
import { createSystemAdminNotificationStore } from "./convexSystemAdminNotificationStore";
import { createSystemAdminSearchStore } from "./convexSystemAdminSearchStore";
import { createUserDirectory, createUserDirectoryRead } from "../groups/convexUserDirectory";
import { createGroupReadRepository } from "../groups/convexGroupRepository";
import {
  createGroupMembershipReadRepository,
  createGroupMembershipRepository,
} from "../groups/convexGroupMembershipRepository";
import {
  createGroupInvitationReadRepository,
  createGroupInvitationRepository,
} from "../groups/convexGroupInvitationRepository";
import { createGroupDeletionJobReader } from "../groupDeletion/convexGroupDeletionJobStore";
import { createGroupDeletionWorkflowService } from "../groupDeletion/convexGroupDeletionWorkflow";
import { createAccountDeletionRequestReader } from "../accountDeletion/convexAccountDeletionRequestStore";

export function createSystemAdminMutationDeps(ctx: MutationCtx) {
  return {
    admins: createSystemAdminStore(ctx),
    auditLogs: createSystemAdminAuditLogStore(ctx),
    notifications: createSystemAdminNotificationStore(ctx),
    search: createSystemAdminSearchStore(ctx),
    users: createUserDirectory(ctx),
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipRepository(ctx),
    invitations: createGroupInvitationRepository(ctx),
    groupDeletionJobs: createGroupDeletionJobReader(ctx),
    groupDeletionWorkflow: createGroupDeletionWorkflowService(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
  };
}

/** 読み取り専用コンテキスト（query）向けの依存組み立て。 */
export function createSystemAdminQueryDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    admins: createSystemAdminReadStore(ctx),
    auditLogs: createSystemAdminAuditLogReader(ctx),
    users: createUserDirectoryRead(ctx),
    groups: createGroupReadRepository(ctx),
    memberships: createGroupMembershipReadRepository(ctx),
    invitations: createGroupInvitationReadRepository(ctx),
    groupDeletionJobs: createGroupDeletionJobReader(ctx),
    accountDeletionRequests: createAccountDeletionRequestReader(ctx),
  };
}
