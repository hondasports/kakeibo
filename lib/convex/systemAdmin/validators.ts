import { v } from "convex/values";
import {
  SYSTEM_ADMIN_AUDIT_ACTIONS,
  SYSTEM_ADMIN_AUDIT_ACTOR_TYPES,
  SYSTEM_ADMIN_AUDIT_RESULTS,
  SYSTEM_ADMIN_AUDIT_TARGET_KINDS,
} from "../../domain/systemAdmin/auditLog";
import { SYSTEM_ADMIN_NOTIFICATION_ACTIONS } from "../../domain/systemAdmin/notificationStore";
import { SYSTEM_ADMIN_STATUSES } from "../../domain/systemAdmin/systemAdminStore";
import { GROUP_MEMBERSHIP_STATUSES } from "../../domain/groups/role";

export const systemAdminAuditActionValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_ACTIONS.map((action) => v.literal(action)),
);

export const systemAdminAuditActorTypeValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_ACTOR_TYPES.map((actorType) => v.literal(actorType)),
);

export const systemAdminAuditTargetKindValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_TARGET_KINDS.map((targetKind) => v.literal(targetKind)),
);

export const systemAdminAuditResultValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_RESULTS.map((result) => v.literal(result)),
);

export const systemAdminStatusValidator = v.union(
  ...SYSTEM_ADMIN_STATUSES.map((status) => v.literal(status)),
);

export const systemAdminNotificationActionValidator = v.union(
  ...SYSTEM_ADMIN_NOTIFICATION_ACTIONS.map((action) => v.literal(action)),
);

export const groupMembershipStatusValidator = v.union(
  ...GROUP_MEMBERSHIP_STATUSES.map((status) => v.literal(status)),
);
