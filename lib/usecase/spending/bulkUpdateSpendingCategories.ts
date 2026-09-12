import { ConvexError } from "convex/values";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { SpendingAuditLogger } from "../../domain/spending/spendingAuditLogger";
import {
  MAX_BULK_SPENDING_SELECTION,
  normalizeBulkSpendingIds,
} from "../../domain/spending/bulkSpending";
import { BULK_SPENDING_CATEGORY_CHANGED_ACTION } from "../../domain/spending/bulkSpendingAudit";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { loadValidatedSpendingRecords } from "./loadValidatedSpendingRecords";
import { recordBulkSpendingAudit } from "./recordBulkSpendingAudit";

export type BulkSpendingUsecaseArgs = {
  expenseEntryIds: string[];
  receiptIds: string[];
};

/** expenseEntries / receipts の横断選択に対してカテゴリを一括変更する。 */
export async function bulkUpdateSpendingCategories(
  ctx: UsecaseGroupContext,
  deps: {
    expenseEntries: ExpenseEntryRepository;
    receipts: ReceiptRepository;
    categories: CategoryRepository;
    auditLog: SpendingAuditLogger;
  },
  args: BulkSpendingUsecaseArgs & { categoryId: string },
): Promise<{ updatedCount: number }> {
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

  const nextCategory = await assertUsableCategory(deps.categories, args.categoryId, ctx.groupId, {
    inactiveErrorMessage: "Inactive category cannot be used for expense entries",
  });

  const records = await loadValidatedSpendingRecords(
    ctx.groupId,
    { expenseEntryIds, receiptIds },
    deps,
  );

  const now = Date.now();
  for (const id of expenseEntryIds) {
    await deps.expenseEntries.patch(id, { categoryId: args.categoryId, updatedAt: now });
  }
  for (const id of receiptIds) {
    await deps.receipts.patch(id, { categoryId: args.categoryId, updatedAt: now });
  }

  await recordBulkSpendingAudit(ctx.groupId, ctx.userId, deps, {
    action: BULK_SPENDING_CATEGORY_CHANGED_ACTION,
    records,
    nextCategory: { categoryId: args.categoryId, categoryName: nextCategory.name },
  });

  return { updatedCount: totalCount };
}
