import { ConvexError } from "convex/values";
import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import { Receipt } from "../../domain/receipt/receipt";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { BulkSpendingAuditRecord } from "../../domain/spending/bulkSpendingAudit";

/**
 * 一括支出操作の対象レコードを読み込み、所有権・支出種別を検証する。
 * 検証済みレコードを監査用スナップショット形状で返す。
 */
export async function loadValidatedSpendingRecords(
  groupId: string,
  ids: { expenseEntryIds: string[]; receiptIds: string[] },
  deps: { expenseEntries: ExpenseEntryRepository; receipts: ReceiptRepository },
): Promise<BulkSpendingAuditRecord[]> {
  const records: BulkSpendingAuditRecord[] = [];

  for (const id of ids.expenseEntryIds) {
    const fields = await deps.expenseEntries.findById(id);
    if (fields === null) {
      throw new ConvexError("Expense entry not found");
    }
    const entry = ExpenseEntry.fromPersisted(fields);
    if (!entry.belongsToGroup(groupId)) {
      throw new ConvexError("Expense entry does not belong to the current group");
    }
    if (!entry.isSpendingRecord()) {
      throw new ConvexError("Income records cannot be included in bulk spending operations");
    }
    records.push({ id, kind: "expenseEntry", date: entry.date, categoryId: entry.categoryId });
  }

  for (const id of ids.receiptIds) {
    const fields = await deps.receipts.findById(id);
    if (fields === null) {
      throw new ConvexError("Receipt not found");
    }
    const receipt = Receipt.fromPersisted(fields);
    if (!receipt.belongsToGroup(groupId)) {
      throw new ConvexError("Receipt does not belong to the current group");
    }
    if (!receipt.isExpenseRecord()) {
      throw new ConvexError("Income records cannot be included in bulk spending operations");
    }
    records.push({ id, kind: "receipt", date: receipt.date, categoryId: receipt.categoryId });
  }

  return records;
}
