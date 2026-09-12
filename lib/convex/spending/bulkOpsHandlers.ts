/**
 * 支出一括操作のハンドラグルー。
 * 認証・依存構築だけを行い、業務ロジックは lib/usecase/spending に委譲する。
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import {
  MAX_BULK_SPENDING_SELECTION,
  normalizeBulkSpendingIds as normalizeBulkSpendingIdsDomain,
} from "../../domain/spending/bulkSpending";
import { bulkUpdateSpendingCategories } from "../../usecase/spending/bulkUpdateSpendingCategories";
import { bulkDeleteSpendingRecords } from "../../usecase/spending/bulkDeleteSpendingRecords";
import { createExpenseEntryRepository } from "../expenseEntries/expenseEntryRepository";
import { createReceiptRepository } from "../receipts/receiptRepository";
import { createCategoryRepository } from "../categories/categoryRepository";
import { createSpendingAuditLogger } from "./spendingAuditLogger";

export type BulkSpendingIdArgs = {
  expenseEntryIds: Id<"expenseEntries">[];
  receiptIds: Id<"receipts">[];
};

/**
 * ID 集合を正規化する（重複除去 + 件数制約）。
 * 互換のため ConvexError を投げる形を維持する。内部ルールは domain 側が正本。
 */
export function normalizeBulkSpendingIds(args: BulkSpendingIdArgs): {
  expenseEntryIds: Id<"expenseEntries">[];
  receiptIds: Id<"receipts">[];
  totalCount: number;
} {
  const result = normalizeBulkSpendingIdsDomain(args);
  if (!result.success) {
    if (result.error === "empty") {
      throw new ConvexError("At least one spending record id is required");
    }
    throw new ConvexError(
      `At most ${MAX_BULK_SPENDING_SELECTION} spending records can be updated at once`,
    );
  }
  return {
    expenseEntryIds: result.data.expenseEntryIds as Id<"expenseEntries">[],
    receiptIds: result.data.receiptIds as Id<"receipts">[],
    totalCount: result.data.totalCount,
  };
}

function buildDeps(ctx: Pick<MutationCtx, "db">) {
  return {
    expenseEntries: createExpenseEntryRepository(ctx),
    receipts: createReceiptRepository(ctx),
    categories: createCategoryRepository(ctx),
    auditLog: createSpendingAuditLogger(ctx),
  };
}

export async function bulkUpdateSpendingCategoriesHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: BulkSpendingIdArgs & { categoryId: Id<"categories"> },
): Promise<{ updatedCount: number }> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return await bulkUpdateSpendingCategories({ groupId, userId }, buildDeps(ctx), args);
}

export async function bulkDeleteSpendingRecordsHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: BulkSpendingIdArgs,
): Promise<{ deletedCount: number }> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return await bulkDeleteSpendingRecords({ groupId, userId }, buildDeps(ctx), args);
}
