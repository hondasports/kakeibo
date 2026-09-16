import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { QueryCtx } from "../../../convex/_generated/server";
import {
  mergeSearchEntrySources,
  partitionExpenseEntriesByKind,
  partitionReceiptsByKind,
} from "../../domain/expenseSearch/searchEntries";
import {
  addLegacyReceiptGroups,
  enrichSpendingEntriesWithReceiptGroups,
  mapExpenseEntriesToReceiptLinkages,
  mapIncomeExpenseEntryToListEntry,
  mapReceiptToIncomeListEntry,
  mapReceiptToSpendingEntry,
  type IncomeListEntry,
  type SpendingEntry,
} from "../receipts/spendingEntries";

export const SEARCH_MAX_RECORDS = 10_000;

// Convexの1実行では複数の独立queryをpaginateできないため、支出・収入の
// 複数sourceを結合する検索は各sourceを有限件数で読み、domain側のkeyset cursorで続きから返す。
// unboundedなcollectは行わず、上限超過はUIへtruncatedとして伝える。

type SearchDocsResult<T> = {
  docs: T[];
  truncated: boolean;
};

async function fetchExpenseEntriesForSearch(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  startDate?: string,
  endDate?: string,
): Promise<SearchDocsResult<Doc<"expenseEntries">>> {
  const query = ctx.db
    .query("expenseEntries")
    .withIndex("by_group_id_and_date", (q) => {
      if (startDate !== undefined && endDate !== undefined) {
        return q.eq("groupId", groupId).gte("date", startDate).lte("date", endDate);
      }
      if (startDate !== undefined) {
        return q.eq("groupId", groupId).gte("date", startDate);
      }
      if (endDate !== undefined) {
        return q.eq("groupId", groupId).lte("date", endDate);
      }
      return q.eq("groupId", groupId);
    })
    .order("desc");

  const docs = await query.take(SEARCH_MAX_RECORDS + 1);
  return {
    docs: docs.slice(0, SEARCH_MAX_RECORDS),
    truncated: docs.length > SEARCH_MAX_RECORDS,
  };
}

async function fetchReceiptsForSearch(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  startDate?: string,
  endDate?: string,
): Promise<SearchDocsResult<Doc<"receipts">>> {
  const query = ctx.db
    .query("receipts")
    .withIndex("by_group_id_and_date", (q) => {
      if (startDate !== undefined && endDate !== undefined) {
        return q.eq("groupId", groupId).gte("date", startDate).lte("date", endDate);
      }
      if (startDate !== undefined) {
        return q.eq("groupId", groupId).gte("date", startDate);
      }
      if (endDate !== undefined) {
        return q.eq("groupId", groupId).lte("date", endDate);
      }
      return q.eq("groupId", groupId);
    })
    .order("desc");

  const docs = await query.take(SEARCH_MAX_RECORDS + 1);
  return {
    docs: docs.slice(0, SEARCH_MAX_RECORDS),
    truncated: docs.length > SEARCH_MAX_RECORDS,
  };
}

export type SearchHistoryEntries = {
  entries: SpendingEntry[];
  incomes: IncomeListEntry[];
  truncated: boolean;
};

export async function loadHistoryEntriesForSearch(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  startDate?: string,
  endDate?: string,
): Promise<SearchHistoryEntries> {
  const [newEntryResult, receiptResult] = await Promise.all([
    fetchExpenseEntriesForSearch(ctx, groupId, startDate, endDate),
    fetchReceiptsForSearch(ctx, groupId, startDate, endDate),
  ]);
  const newEntries = newEntryResult.docs;
  const receipts = receiptResult.docs;

  // 新旧sourceを月単位で切り替えると、同じ月に残る旧形式の明細が欠落する。
  // 同じ明細であることを確実に判定できないため、検索では両sourceを結合して
  // source-qualified IDだけでdedupeする。週次・月次集計の互換ルールとは別に、
  // 移行中の履歴検索は利用可能な履歴をすべて表示する。
  const newKinds = partitionExpenseEntriesByKind(newEntries);
  const legacyKinds = partitionReceiptsByKind(receipts);

  const enrichedEntries = await enrichSpendingEntriesWithReceiptGroups(
    ctx,
    groupId,
    mapExpenseEntriesToReceiptLinkages(newKinds.expenses),
  );
  const entries = mergeSearchEntrySources(
    enrichedEntries,
    addLegacyReceiptGroups(
      legacyKinds.expenses.map((receipt) => mapReceiptToSpendingEntry(receipt)),
    ),
  );
  const incomes = mergeSearchEntrySources(
    newKinds.incomes.map((entry) => mapIncomeExpenseEntryToListEntry(entry)),
    legacyKinds.incomes.map((receipt) => mapReceiptToIncomeListEntry(receipt)),
  );

  return {
    entries,
    incomes,
    truncated: newEntryResult.truncated || receiptResult.truncated,
  };
}

/** 支出だけを扱う既存caller向けの互換ラッパー。 */
export async function loadSpendingEntriesForSearch(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  startDate?: string,
  endDate?: string,
): Promise<{ entries: SpendingEntry[]; truncated: boolean }> {
  const result = await loadHistoryEntriesForSearch(ctx, groupId, startDate, endDate);
  return { entries: result.entries, truncated: result.truncated };
}
