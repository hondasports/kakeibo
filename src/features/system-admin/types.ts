import type { AppEnvironment } from "../../../lib/domain/systemAdmin/environment";
import type {
  SystemAdminAuditAction,
  SystemAdminAuditActorType,
  SystemAdminAuditResult,
} from "../../../lib/domain/systemAdmin/auditLog";
import type { GroupLifecycleStatus } from "../../../lib/domain/groups/lifecycle";
import type { SystemAdminStatus } from "../../../lib/domain/systemAdmin/systemAdminStore";
import type { GroupMembershipStatus } from "../../../lib/domain/groups/role";
export type { AppEnvironment, SystemAdminAuditAction, SystemAdminStatus };

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
  status: GroupLifecycleStatus;
  createdAt: number;
  updatedAt: number;
};

export type PageResult<T> = {
  environment: AppEnvironment;
  page: T[];
  isDone: boolean;
  continueCursor: string;
};

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

export type SystemAdminAuditItem = {
  id: string;
  action: SystemAdminAuditAction;
  actorType: SystemAdminAuditActorType;
  actorUserId?: string;
  actorDisplayName: string | null;
  targetUserId?: string;
  targetId?: string;
  targetDisplayName?: string;
  sourceUserId?: string;
  sourceUserDisplayName?: string;
  result: SystemAdminAuditResult;
  queryHash?: string;
  resultCount?: number;
  reason?: string;
  previousStatus?: SystemAdminStatus;
  newStatus?: SystemAdminStatus;
  sourceGroupId?: string;
  sourceGroupNameSnapshot?: string;
  targetGroupId?: string;
  targetGroupNameSnapshot?: string;
  beforeMembershipStatus?: GroupMembershipStatus;
  afterMembershipStatus?: GroupMembershipStatus;
  beforeActiveGroupId?: string;
  afterActiveGroupId?: string;
  beforeOwnerCount?: number;
  afterOwnerCount?: number;
  beforeNotificationEnabled?: boolean;
  afterNotificationEnabled?: boolean;
  createdAt: number;
};
