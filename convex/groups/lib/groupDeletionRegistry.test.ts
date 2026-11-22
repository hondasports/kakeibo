import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { GROUP_DELETION_PURGE_STAGES as GROUP_DELETION_PURGE_TABLES } from "../../../lib/domain/groupDeletion/stages";

function getSchemaGroupScopedTables() {
  return Object.entries(schema.tables)
    .filter(([, table]) => {
      const validator = table.validator as {
        kind: string;
        fields?: Record<string, { kind?: string; tableName?: string }>;
      };
      const groupId = validator.kind === "object" ? validator.fields?.groupId : undefined;
      return groupId?.kind === "id" && groupId.tableName === "groups";
    })
    .map(([tableName]) => tableName)
    .sort();
}

describe("group deletion registry", () => {
  it("schema の groupId を持つ全tableをpurge対象として分類する", () => {
    expect([...GROUP_DELETION_PURGE_TABLES].sort()).toEqual(getSchemaGroupScopedTables());
  });

  it("参照関係を壊さない順序で削除する", () => {
    expect(GROUP_DELETION_PURGE_TABLES).toEqual([
      "receiptAnalysisImageJobs",
      "aiExpenseDraftItems",
      "aiExpenseDrafts",
      "receiptAnalysisBatches",
      "expenseEntries",
      "receipts",
      "sourceDocuments",
      "recurringEntryRules",
      "weekSessions",
      "categories",
      "groupInvitations",
      "managementAuditLogs",
      "groupMembers",
    ]);
  });
});
