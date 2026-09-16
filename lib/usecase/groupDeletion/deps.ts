/**
 * groupDeletion ユースケースの依存型（deps）。
 * composition root（lib/convex/groupDeletion/groupDeletionDeps.ts）が実装を束ねる。
 */
import type { GroupDeletionJobStore } from "../../domain/groupDeletion/groupDeletionJobStore";
import type { GroupDeletionJobReader } from "../../domain/groupDeletion/groupDeletionJob";
import type {
  GroupDeletionPurgeReadStore,
  GroupDeletionPurgeStore,
} from "../../domain/groupDeletion/groupPurgeStore";
import type { GroupDeletionRecipientStore } from "../../domain/groupDeletion/groupDeletionRecipientStore";
import type { GroupDeletionScheduler } from "../../domain/groupDeletion/groupDeletionScheduler";
import type { GroupReadRepository, GroupRepository } from "../../domain/groups/groupRepository";
import type { UserDirectory, UserDirectoryRead } from "../../domain/groups/userDirectory";
import type { GroupEmailNotificationQueue } from "../../domain/groups/groupServices";

export type GroupDeletionMutationDeps = {
  jobs: GroupDeletionJobStore;
  purge: GroupDeletionPurgeStore;
  recipients: GroupDeletionRecipientStore;
  scheduler: GroupDeletionScheduler;
  groups: GroupRepository;
  users: UserDirectory;
  emailQueue: GroupEmailNotificationQueue;
};

export type GroupDeletionQueryDeps = {
  jobs: GroupDeletionJobReader;
  purge: GroupDeletionPurgeReadStore;
  groups: GroupReadRepository;
  users: UserDirectoryRead;
};
