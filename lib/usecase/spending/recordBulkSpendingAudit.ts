import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import {
  buildBulkSpendingAuditSnapshot,
  formatBulkSpendingAuditTargetLabel,
  type BulkSpendingAuditRecord,
} from "../../domain/spending/bulkSpendingAudit";
import type {
  SpendingAuditAction,
  SpendingAuditLogger,
} from "../../domain/spending/spendingAuditLogger";

async function loadCategoryNamesById(
  categories: CategoryRepository,
  categoryIds: Array<string | undefined>,
): Promise<Map<string, string>> {
  const namesById = new Map<string, string>();
  for (const categoryId of [...new Set(categoryIds.filter((id): id is string => Boolean(id)))]) {
    const category = await categories.findById(categoryId);
    if (category !== null) {
      namesById.set(categoryId, category.name);
    }
  }
  return namesById;
}

/**
 * 一括支出操作の監査スナップショットを構築し、監査ログへ記録する。
 */
export async function recordBulkSpendingAudit(
  groupId: string,
  actorUserId: string,
  deps: { categories: CategoryRepository; auditLog: SpendingAuditLogger },
  args: {
    action: SpendingAuditAction;
    records: BulkSpendingAuditRecord[];
    nextCategory?: { categoryId: string; categoryName: string };
  },
): Promise<void> {
  const categoryNamesById = await loadCategoryNamesById(deps.categories, [
    ...args.records.map((record) => record.categoryId),
    args.nextCategory?.categoryId,
  ]);
  const snapshot = buildBulkSpendingAuditSnapshot(
    args.records,
    categoryNamesById,
    args.nextCategory,
  );

  await deps.auditLog.record({
    groupId,
    actorUserId,
    action: args.action,
    targetLabel: formatBulkSpendingAuditTargetLabel(snapshot, args.action),
    afterValue: JSON.stringify(snapshot),
  });
}
