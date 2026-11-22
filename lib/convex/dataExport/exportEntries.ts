import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { loadHistoryEntriesForSearch } from "../expenseSearch/loadSpendingEntries";
import { buildCategoryInfoMap } from "../receipts/summaryLib/categoryAggregation";
import type { ExportEntryKind } from "../../domain/export/exportCsv";

export type ExportEntryRow = {
  date: string;
  kind: ExportEntryKind;
  title: string;
  categoryName: string;
  amountYen: number;
  memo: string;
};

export type ExportEntriesResult = {
  rows: ExportEntryRow[];
  // 1回の取得で各source最大10,000件まで。超過月は呼び出し側がエラーとして扱う。
  truncated: boolean;
  // 書き出し対象のグループ。月ごとの分割取得では1回目の結果を
  // 2回目以降の expectedGroupId に渡し、途中のグループ切替を検出する。
  groupId: Id<"groups">;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function exportEntriesHandler(
  ctx: QueryCtx,
  args: {
    startDate: string;
    endDate: string;
    entryType?: ExportEntryKind;
    expectedGroupId?: Id<"groups">;
  },
): Promise<ExportEntriesResult> {
  if (!DATE_PATTERN.test(args.startDate) || !DATE_PATTERN.test(args.endDate)) {
    throw new ConvexError("期間はYYYY-MM-DD形式で指定してください");
  }
  if (args.startDate > args.endDate) {
    throw new ConvexError("開始日は終了日以前の日付を指定してください");
  }
  const { groupId } = await requireGroupMembership(ctx);
  // 分割取得の途中で利用グループが切り替わったら、別グループの明細が
  // 同じCSVに混ざらないよう中止する。
  if (args.expectedGroupId !== undefined && args.expectedGroupId !== groupId) {
    throw new ConvexError("書き出し中に利用グループが変更されました。最初からやり直してください");
  }

  const { entries, incomes, truncated } = await loadHistoryEntriesForSearch(
    ctx,
    groupId,
    args.startDate,
    args.endDate,
  );

  const categoryIds = [...new Set(entries.map((entry) => entry.categoryId).filter(Boolean))];
  const categoryMap = await buildCategoryInfoMap(ctx, groupId, categoryIds);

  const rows: ExportEntryRow[] = [];
  if (args.entryType !== "income") {
    for (const entry of entries) {
      rows.push({
        date: entry.date,
        kind: "expense",
        title: entry.itemName ?? entry.shopName ?? entry.receiptShopName ?? "",
        categoryName: categoryMap.get(entry.categoryId)?.name ?? "",
        amountYen: entry.amountYen,
        memo: entry.memo ?? "",
      });
    }
  }
  if (args.entryType !== "expense") {
    for (const income of incomes) {
      rows.push({
        date: income.date,
        kind: "income",
        title: income.bankName ?? "",
        categoryName: "",
        amountYen: income.amountYen,
        memo: income.memo ?? "",
      });
    }
  }
  // 日付昇順 → 同日は支出→収入の順で安定させる（新旧source混在でも同じ並びになる）。
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return { rows, truncated, groupId };
}
