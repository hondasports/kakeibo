/**
 * systemAdmin ユースケースの依存型（deps）。
 * composition root（lib/convex/systemAdmin/systemAdminDeps.ts）が実装を束ねる。
 */
import type { SystemAdminStore } from "../../domain/systemAdmin/systemAdminStore";
import type { SystemAdminAuditLogStore } from "../../domain/systemAdmin/auditLog";
import type { SystemAdminNotificationStore } from "../../domain/systemAdmin/notificationStore";
import type { SystemAdminSearchStore } from "../../domain/systemAdmin/searchStore";
import type { UserDirectory, UserDirectoryRead } from "../../domain/groups/userDirectory";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type {
  GroupMembershipReadRepository,
  GroupMembershipRepository,
} from "../../domain/groups/groupMembershipRepository";
import type {
  GroupInvitationReadRepository,
  GroupInvitationRepository,
} from "../../domain/groups/groupInvitationRepository";
import type { GroupDeletionJobReader } from "../../domain/groupDeletion/groupDeletionJob";
import type { GroupDeletionWorkflowService } from "../../domain/groupDeletion/groupDeletionWorkflow";
import type { AccountDeletionRequestReader } from "../../domain/accountDeletion/request";

export type SystemAdminMutationDeps = {
  admins: SystemAdminStore;
  auditLogs: SystemAdminAuditLogStore;
  notifications: SystemAdminNotificationStore;
  search: SystemAdminSearchStore;
  users: UserDirectory;
  groups: GroupReadRepository;
  memberships: GroupMembershipRepository;
  invitations: GroupInvitationRepository;
  groupDeletionJobs: GroupDeletionJobReader;
  groupDeletionWorkflow: GroupDeletionWorkflowService;
  accountDeletionRequests: AccountDeletionRequestReader;
};

export type SystemAdminQueryDeps = {
  admins: Pick<SystemAdminStore, "findByUserDocId" | "takeByStatus" | "paginateByStatus">;
  auditLogs: Pick<SystemAdminAuditLogStore, "paginate">;
  users: UserDirectoryRead;
  groups: GroupReadRepository;
  memberships: GroupMembershipReadRepository;
  invitations: GroupInvitationReadRepository;
  groupDeletionJobs: GroupDeletionJobReader;
  accountDeletionRequests: AccountDeletionRequestReader;
};
