import { v } from "convex/values";
import { SYSTEM_ADMIN_AUDIT_ACTIONS } from "../../domain/systemAdmin/auditLog";

export const systemAdminAuditActionValidator = v.union(
  ...SYSTEM_ADMIN_AUDIT_ACTIONS.map((action) => v.literal(action)),
);
