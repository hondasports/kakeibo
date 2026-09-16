/**
 * groups ユースケース共通の依存ポート。
 */
import type { GroupRepository } from "../../domain/groups/groupRepository";
import type { GroupMembershipRepository } from "../../domain/groups/groupMembershipRepository";
import type { UserDirectory } from "../../domain/groups/userDirectory";
import type { GroupInvitationRepository } from "../../domain/groups/groupInvitationRepository";
import type { ManagementAuditLogRecorder } from "../../domain/groups/managementAuditLogRepository";
import type {
  AccountDeletionGuard,
  GroupEmailNotificationQueue,
  GroupInvitationCleanupService,
  GroupOwnerTransitionGuard,
} from "../../domain/groups/groupServices";
import type { GroupDeletionJobReader } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionWorkflowService } from "../../domain/groupDeletion/groupDeletionWorkflow";

export type GroupMutationDeps = {
  groups: GroupRepository;
  memberships: GroupMembershipRepository;
  users: UserDirectory;
  invitations: GroupInvitationRepository;
  auditLog: ManagementAuditLogRecorder;
  emailQueue: GroupEmailNotificationQueue;
  accountDeletion: AccountDeletionGuard;
  ownerTransition: GroupOwnerTransitionGuard;
  invitationCleanup: GroupInvitationCleanupService;
  deletionJobs: GroupDeletionJobReader;
  deletionWorkflow: GroupDeletionWorkflowService;
};
