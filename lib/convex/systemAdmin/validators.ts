import { v } from "convex/values";
import { SYSTEM_ADMIN_AUDIT_ACTIONS } from "../../domain/systemAdmin/auditLog";
import { GROUP_MEMBERSHIP_STATUSES } from "../../domain/groups/role";

export const systemAdminAuditActionValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_ACTIONS.map((action) => v.literal(action)),
);

export const groupMembershipStatusValidator = v.union(
  ...GROUP_MEMBERSHIP_STATUSES.map((status) => v.literal(status)),
);
