export type AppEnvironment = "development" | "preview" | "production";

export type UserSearchItem = {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  activeGroupId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type GroupSearchItem = {
  id: string;
  name: string;
  status: "active" | "deleting" | "deleted" | "archived";
  createdAt: number;
  updatedAt: number;
};

export type PageResult<T> = {
  environment: AppEnvironment;
  page: T[];
  isDone: boolean;
  continueCursor: string;
};

export type SystemAdminStatus = "active" | "revoked";

export type SystemAdminListItem = {
  id: string;
  targetUserId: string;
  displayName: string;
  email: string | null;
  status: SystemAdminStatus;
  createdAt: number;
  updatedAt: number;
  grantedAt: number;
  revokedAt?: number;
  isSelf: boolean;
};

export type SystemAdminListResult = PageResult<SystemAdminListItem> & {
  hasAnotherActiveAdmin: boolean;
};

export type SystemAdminAuditAction =
  | "system_admin_bootstrapped"
  | "system_admin_granted"
  | "system_admin_revoked"
  | "system_admin_recovered"
  | "system_admin_user_searched"
  | "system_admin_group_searched"
  | "system_admin_user_viewed"
  | "system_admin_group_viewed"
  | "system_admin_membership_added"
  | "system_admin_membership_removed"
  | "system_admin_membership_transferred"
  | "system_admin_active_group_set"
  | "system_admin_active_group_cleared"
  | "system_admin_group_deletion_resumed"
  | "system_admin_ownerless_group_recovered"
  | "system_admin_group_role_changed"
  | "system_admin_group_owner_transferred"
  | "system_admin_group_invitation_revoked"
  | "system_admin_notification_setting_changed";

export type SystemAdminAuditItem = {
  id: string;
  action: SystemAdminAuditAction;
  actorType: "system" | "system_admin";
  actorUserId?: string;
  actorDisplayName: string | null;
  targetUserId?: string;
  targetId?: string;
  targetDisplayName?: string;
  sourceUserId?: string;
  sourceUserDisplayName?: string;
  result: "success" | "denied";
  queryHash?: string;
  resultCount?: number;
  reason?: string;
  previousStatus?: SystemAdminStatus;
  newStatus?: SystemAdminStatus;
  sourceGroupId?: string;
  sourceGroupNameSnapshot?: string;
  targetGroupId?: string;
  targetGroupNameSnapshot?: string;
  beforeMembershipStatus?: "none" | "member" | "owner";
  afterMembershipStatus?: "none" | "member" | "owner";
  beforeActiveGroupId?: string;
  afterActiveGroupId?: string;
  beforeOwnerCount?: number;
  afterOwnerCount?: number;
  beforeNotificationEnabled?: boolean;
  afterNotificationEnabled?: boolean;
  createdAt: number;
};
