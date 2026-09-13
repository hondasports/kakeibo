/**
 * accountDeletion ユースケースの依存型（deps）。
 * composition root（lib/convex/accountDeletion/accountDeletionDeps.ts）が実装を束ねる。
 */
import type { AccountDeletionRequestStore } from "../../domain/accountDeletion/request";
import type { AccountDeletionGroupPurgeStore } from "../../domain/accountDeletion/groupPurgeStore";
import type { AccountDeletionUserDataPurgeStore } from "../../domain/accountDeletion/userDataPurgeStore";
import type { AccountDeletionScheduler } from "../../domain/accountDeletion/scheduler";
import type { GroupDeletionJobStore } from "../../domain/groupDeletion/groupDeletionJobStore";
import type { GroupDeletionWorkflowService } from "../../domain/groupDeletion/groupDeletionWorkflow";
import type {
  GroupMembershipReadRepository,
  GroupMembershipRepository,
} from "../../domain/groups/groupMembershipRepository";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { UserDirectory, UserDirectoryRead } from "../../domain/groups/userDirectory";
import type { GroupInvitationCleanupService } from "../../domain/groups/groupServices";
import type { TransactionalEmailQueue } from "../../domain/email/emailQueue";

export type AccountDeletionMutationDeps = {
  requests: AccountDeletionRequestStore;
  purges: AccountDeletionGroupPurgeStore;
  userData: AccountDeletionUserDataPurgeStore;
  scheduler: AccountDeletionScheduler;
  memberships: GroupMembershipRepository;
  groups: GroupReadRepository;
  users: UserDirectory;
  groupDeletionJobs: GroupDeletionJobStore;
  groupDeletionWorkflow: GroupDeletionWorkflowService;
  invitationCleanup: GroupInvitationCleanupService;
  emailQueue: TransactionalEmailQueue;
};

export type AccountDeletionQueryDeps = {
  requests: Pick<AccountDeletionRequestStore, "get" | "listByUser">;
  memberships: GroupMembershipReadRepository;
  groups: GroupReadRepository;
  users: UserDirectoryRead;
};
