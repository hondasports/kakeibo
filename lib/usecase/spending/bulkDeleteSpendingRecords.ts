import { ConvexError } from "convex/values";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { SpendingAuditLogger } from "../../domain/spending/spendingAuditLogger";
import {
  MAX_BULK_SPENDING_SELECTION,
  normalizeBulkSpendingIds,
} from "../../domain/spending/bulkSpending";
import { BULK_SPENDING_DELETED_ACTION } from "../../domain/spending/bulkSpendingAudit";
import type { UsecaseGroupContext } from "../context";
import { loadValidatedSpendingRecords } from "./loadValidatedSpendingRecords";
import { recordBulkSpendingAudit } from "./recordBulkSpendingAudit";
import type { BulkSpendingUsecaseArgs } from "./bulkUpdateSpendingCategories";

/** expenseEntries / receipts の横断選択を一括削除する。 */
export async function bulkDeleteSpendingRecords(
  ctx: UsecaseGroupContext,
  deps: {
    expenseEntries: ExpenseEntryRepository;
    receipts: ReceiptRepository;
    categories: CategoryRepository;
    auditLog: SpendingAuditLogger;
  },
  args: BulkSpendingUsecaseArgs,
): Promise<{ deletedCount: number }> {
  const normalized = normalizeBulkSpendingIds(args);
  if (!normalized.success) {
    if (normalized.error === "empty") {
      throw new ConvexError("At least one spending record id is required");
    }
    throw new ConvexError(
      `At most ${MAX_BULK_SPENDING_SELECTION} spending records can be updated at once`,
    );
  }
  const { expenseEntryIds, receiptIds, totalCount } = normalized.data;

  const records = await loadValidatedSpendingRecords(
    ctx.groupId,
    { expenseEntryIds, receiptIds },
    deps,
  );

  for (const id of expenseEntryIds) {
    await deps.expenseEntries.delete(id);
  }
  for (const id of receiptIds) {
    await deps.receipts.delete(id);
  }

  await recordBulkSpendingAudit(ctx.groupId, ctx.userId, deps, {
    action: BULK_SPENDING_DELETED_ACTION,
    records,
  });

  return { deletedCount: totalCount };
}
