import type { LineLinkAuditFields, LineLinkAuditRecord } from "./records";

export interface LineLinkAuditLogStore {
  insert(fields: LineLinkAuditFields): Promise<void>;
  takeByUserId(userId: string, limit: number): Promise<LineLinkAuditRecord[]>;
  deleteById(auditId: string): Promise<void>;
}
