import type { AccountDeletionRequestReader } from "../../domain/accountDeletion/request";
import type { GroupReadRepository } from "../../domain/groups/groupRepository";
import type { GroupMembershipReadRepository } from "../../domain/groups/groupMembershipRepository";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";
import type { LineAccountLinkReader } from "../../domain/lineLink/accountLinkStore";
import type {
  LineNotificationActionRunner,
  LinePushSender,
} from "../../domain/notifications/runner";
import type {
  LineNotificationJobStore,
  LineNotificationScheduler,
  NotificationSettingReader,
  NotificationSettingStore,
} from "../../domain/notifications/store";
import type { ReceiptAnalysisReader } from "../../domain/receiptAnalysisJobs/store";
import type { SystemAdminAuditLogStore } from "../../domain/systemAdmin/auditLog";
import type { SystemAdminReadStore } from "../../domain/systemAdmin/systemAdminStore";
import type { EmailJobScheduler, TransactionalEmailJobStore } from "../../domain/email/store";
import type { UserStore } from "../../domain/users/store";

export type NotificationSettingQueryDeps = {
  settings: NotificationSettingReader;
};

export type NotificationUserQueryDeps = {
  settings: NotificationSettingReader;
  users: Pick<UserStore, "findByUserId">;
  links: Pick<LineAccountLinkReader, "listActiveByUserId">;
  accountDeletionRequests: Pick<AccountDeletionRequestReader, "listByUser">;
};

export type NotificationUserMutationDeps = {
  users: Pick<UserStore, "findByUserId" | "patch">;
  links: Pick<LineAccountLinkReader, "listActiveByUserId">;
  accountDeletionRequests: Pick<AccountDeletionRequestReader, "listByUser">;
};

export type NotificationAdminQueryDeps = {
  admins: Pick<SystemAdminReadStore, "findByUserDocId">;
  users: UserDirectoryRead;
  settings: NotificationSettingReader;
};

export type NotificationAdminMutationDeps = {
  admins: Pick<SystemAdminReadStore, "findByUserDocId">;
  users: UserDirectoryRead;
  settings: NotificationSettingStore;
  auditLogs: Pick<SystemAdminAuditLogStore, "insert">;
};

export type AiReviewNotificationEnqueueDeps = {
  batches: Pick<ReceiptAnalysisReader, "getBatch">;
  groups: Pick<GroupReadRepository, "get">;
  memberships: Pick<GroupMembershipReadRepository, "findByGroupAndUser">;
  users: Pick<UserStore, "findByUserId">;
  accountDeletionRequests: Pick<AccountDeletionRequestReader, "listByUser">;
  settings: NotificationSettingReader;
  links: Pick<LineAccountLinkReader, "listActiveByUserId">;
  emailJobs: TransactionalEmailJobStore;
  emailScheduler: EmailJobScheduler;
  lineJobs: LineNotificationJobStore;
  lineScheduler: LineNotificationScheduler;
  now?: () => number;
};

export type LineNotificationClaimDeps = {
  jobs: LineNotificationJobStore;
  settings: NotificationSettingReader;
  users: Pick<UserStore, "findByUserId">;
  links: Pick<LineAccountLinkReader, "listActiveByUserId">;
  batches: Pick<ReceiptAnalysisReader, "getBatch">;
  groups: Pick<GroupReadRepository, "get">;
  memberships: Pick<GroupMembershipReadRepository, "findByGroupAndUser">;
  accountDeletionRequests: Pick<AccountDeletionRequestReader, "listByUser">;
  scheduler: LineNotificationScheduler;
  now?: () => number;
};

export type LineNotificationCompletionDeps = {
  jobs: LineNotificationJobStore;
  scheduler: Pick<LineNotificationScheduler, "scheduleProcessJob">;
  now?: () => number;
};

export type ProcessLineNotificationJobDeps = {
  runner: LineNotificationActionRunner;
  sender: LinePushSender;
  now?: () => number;
};

export type CleanupLineNotificationDeps = {
  jobs: LineNotificationJobStore;
  scheduler: Pick<LineNotificationScheduler, "scheduleCleanup">;
  now?: () => number;
};
