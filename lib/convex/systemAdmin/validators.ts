import { v } from "convex/values";
import { SYSTEM_ADMIN_AUDIT_ACTIONS } from "../../domain/systemAdmin/auditLog";
import { SYSTEM_ADMIN_MEMBERSHIP_OPERATIONS } from "../../domain/systemAdmin/membershipOperation";
import { GROUP_SEARCH_TYPES, USER_SEARCH_TYPES } from "../../domain/systemAdmin/searchQuery";
import { GROUP_MEMBERSHIP_STATUSES } from "../../domain/groups/role";

export const systemAdminAuditActionValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_ACTIONS.map((action) => v.literal(action)),
);

export const groupMembershipStatusValidator = v.union(
  ...GROUP_MEMBERSHIP_STATUSES.map((status) => v.literal(status)),
);

export const systemAdminMembershipOperationValidator = v.union(
  ...SYSTEM_ADMIN_MEMBERSHIP_OPERATIONS.map((operation) => v.literal(operation)),
);

export const userSearchTypeValidator = v.union(
  ...USER_SEARCH_TYPES.map((searchType) => v.literal(searchType)),
);

export const groupQueryTypeValidator = v.union(
  ...GROUP_SEARCH_TYPES.map((queryType) => v.literal(queryType)),
);
