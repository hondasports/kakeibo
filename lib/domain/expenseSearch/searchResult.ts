import type { HistoryAggregate, HistoryComparison, HistoryTrendPoint } from "./analytics";
import type { SearchableHistoryGroup } from "./filter";

export class ExpenseSearchDomainError extends Error {}

export type ExpenseSearchReceipt = {
  _id: string;
  date: string;
  type: "expense" | "income";
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  memo?: string;
  recordType: "expenseEntry" | "receipt";
  itemName?: string;
  receiptGroupId?: string;
  receiptShopName?: string;
  receiptTotalAmountYen?: number;
};

export type ExpenseSearchResult = {
  page: ExpenseSearchReceipt[];
  continueCursor: string;
  isDone: boolean;
  truncated: boolean;
  comparisonTruncated: boolean;
  matchedGroupCount: number;
  totalCount: number;
  expenseCount: number;
  incomeCount: number;
  totalExpenseYen: number;
  totalIncomeYen: number;
  netAmountYen: number;
  byCategory: HistoryAggregate["byCategory"];
  trend: HistoryTrendPoint[];
  comparison: HistoryComparison | null;
};

export function emptySearchResult(): ExpenseSearchResult {
  return {
    page: [],
    continueCursor: "v1.empty",
    isDone: true,
    truncated: false,
    comparisonTruncated: false,
    matchedGroupCount: 0,
    totalCount: 0,
    expenseCount: 0,
    incomeCount: 0,
    totalExpenseYen: 0,
    totalIncomeYen: 0,
    netAmountYen: 0,
    byCategory: [],
    trend: [],
    comparison: null,
  };
}

export function collectCategoryIds(groups: SearchableHistoryGroup[]): string[] {
  return Array.from(
    new Set(
      groups.flatMap((group) =>
        group.type === "income" ? [] : group.items.map((item) => item.categoryId),
      ),
    ),
  );
}

export function mapHistoryGroupToItems(
  group: SearchableHistoryGroup,
  categoryInfoMap: Map<string, { name: string; color: string }>,
): ExpenseSearchReceipt[] {
  if (group.type === "income") {
    const income = group.income;
    return [
      {
        _id: income._id,
        date: income.date,
        type: "income",
        bankName: income.bankName,
        amountYen: income.amountYen,
        memo: income.memo,
        recordType: income.recordType,
      },
    ];
  }

  return group.items.map((item) => {
    const info = categoryInfoMap.get(item.categoryId);
    return {
      _id: item._id,
      date: item.date,
      type: "expense",
      shopName: item.shopName,
      amountYen: item.amountYen,
      categoryId: item.categoryId,
      categoryName: info?.name ?? "不明",
      categoryColor: info?.color ?? "#AAB7C4",
      memo: item.memo,
      recordType: item.recordType,
      itemName: item.itemName,
      receiptGroupId: item.receiptGroupId,
      receiptShopName: item.receiptShopName,
      receiptTotalAmountYen: item.receiptTotalAmountYen,
    };
  });
}
