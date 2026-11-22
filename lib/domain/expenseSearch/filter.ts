import type { IncomeListEntry, SpendingEntry } from "../receipt/spendingEntry";
import { ENTRY_KINDS } from "../common/entryKind";
import { isValidIsoDateString } from "../week/weekDates";
import { getHistoryTrendRangeError } from "./trendRange";

export const HISTORY_ENTRY_TYPES = ["all", ...ENTRY_KINDS] as const;

export type HistoryEntryType = (typeof HISTORY_ENTRY_TYPES)[number];

type SearchableReceiptGroup = {
  id: string;
  date: string;
  shopName: string;
  amountYen: number;
  items: SpendingEntry[];
  type?: "expense";
};

export type SearchableHistoryGroup =
  | SearchableReceiptGroup
  | {
      id: string;
      date: string;
      type: "income";
      bankName?: string;
      amountYen: number;
      items: [];
      income: IncomeListEntry;
    };

export type ExpenseSearchFilters = {
  entryType: HistoryEntryType;
  shopQuery?: string;
  categoryId?: string;
  minAmountYen?: number;
  maxAmountYen?: number;
  startDate?: string;
  endDate?: string;
};

type ExpenseSearchFilterInput = {
  entryType?: string;
  shopQuery?: string;
  categoryId?: string;
  minAmountYen?: number;
  maxAmountYen?: number;
  startDate?: string;
  endDate?: string;
};

type ParsedExpenseSearchFilters =
  | { ok: true; filters: ExpenseSearchFilters }
  | { ok: false; error: string };

const SHOP_QUERY_MAX_LENGTH = 80;

// 項目ごとの近接エラー表示（画面）とparse時の先頭エラー（API）で同じ判定・文言を使う。
export function getShopQueryError(shopQuery: string): string | null {
  return shopQuery.length > SHOP_QUERY_MAX_LENGTH
    ? `検索語は${SHOP_QUERY_MAX_LENGTH}文字以内で指定してください`
    : null;
}

export function getAmountYenError(value: number): string | null {
  return isNonNegativeInteger(value) ? null : "金額は0以上の整数で指定してください";
}

export function getAmountRangeError(
  minAmountYen: number | undefined,
  maxAmountYen: number | undefined,
): string | null {
  return minAmountYen !== undefined && maxAmountYen !== undefined && minAmountYen > maxAmountYen
    ? "金額の下限は上限以下にしてください"
    : null;
}

export function getIsoDateError(value: string): string | null {
  return isValidIsoDateString(value) ? null : "日付はYYYY-MM-DD形式で指定してください";
}

export function getDateRangeError(
  startDate: string | undefined,
  endDate: string | undefined,
): string | null {
  if (startDate !== undefined && endDate !== undefined && startDate > endDate) {
    return "開始日は終了日以前にしてください";
  }
  return getHistoryTrendRangeError(startDate, endDate);
}

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export function groupSpendingEntries(entries: SpendingEntry[]): SearchableReceiptGroup[] {
  const groups = new Map<string, SearchableReceiptGroup>();

  for (const item of entries) {
    const id = item.receiptGroupId ?? `${item.recordType}:${item._id}`;
    const existing = groups.get(id);
    if (existing) {
      existing.items.push(item);
      if (item.receiptTotalAmountYen !== undefined) {
        existing.amountYen = item.receiptTotalAmountYen;
      }
      continue;
    }

    groups.set(id, {
      id,
      date: item.date,
      shopName: item.receiptShopName ?? item.shopName ?? "不明",
      amountYen: item.receiptTotalAmountYen ?? item.amountYen,
      items: [item],
      type: "expense",
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    amountYen: group.amountYen ?? group.items.reduce((sum, item) => sum + item.amountYen, 0),
  }));
}

export function groupHistoryEntries(
  entries: SpendingEntry[],
  incomes: IncomeListEntry[],
): SearchableHistoryGroup[] {
  const expenseGroups = groupSpendingEntries(entries).map((group) => ({
    ...group,
    type: "expense" as const,
  }));
  const incomeGroups: SearchableHistoryGroup[] = incomes.map((income) => ({
    id: `income:${income.recordType}:${income._id}`,
    date: income.date,
    type: "income",
    bankName: income.bankName,
    amountYen: income.amountYen,
    items: [],
    income,
  }));

  return [...expenseGroups, ...incomeGroups];
}

function matchesExpenseQuery(group: SearchableReceiptGroup, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return true;
  }

  const haystacks = [
    group.shopName,
    ...group.items.flatMap((item) => [
      item.shopName,
      item.itemName,
      item.receiptShopName,
      item.memo,
    ]),
  ];

  return haystacks.some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function matchesIncomeQuery(
  group: Extract<SearchableHistoryGroup, { type: "income" }>,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return true;
  }

  return [group.bankName, group.income.memo].some((value) =>
    normalizeSearchText(value).includes(normalizedQuery),
  );
}

function matchesSearchQuery(group: SearchableHistoryGroup, query: string): boolean {
  return group.type === "income"
    ? matchesIncomeQuery(group, query)
    : matchesExpenseQuery(group, query);
}

export function filterHistoryGroups(
  groups: SearchableHistoryGroup[],
  filters: ExpenseSearchFilters,
): SearchableHistoryGroup[] {
  return groups.filter((group) => {
    if (filters.entryType !== "all" && group.type !== filters.entryType) {
      return false;
    }

    if (filters.shopQuery !== undefined && !matchesSearchQuery(group, filters.shopQuery)) {
      return false;
    }

    if (
      filters.categoryId !== undefined &&
      (group.type === "income" ||
        !group.items.some((item) => item.categoryId === filters.categoryId))
    ) {
      return false;
    }

    if (filters.minAmountYen !== undefined && group.amountYen < filters.minAmountYen) {
      return false;
    }

    if (filters.maxAmountYen !== undefined && group.amountYen > filters.maxAmountYen) {
      return false;
    }

    if (filters.startDate !== undefined && group.date < filters.startDate) {
      return false;
    }

    if (filters.endDate !== undefined && group.date > filters.endDate) {
      return false;
    }

    return true;
  });
}

function compareHistoryGroups(left: SearchableHistoryGroup, right: SearchableHistoryGroup): number {
  const dateOrder = right.date.localeCompare(left.date);
  if (dateOrder !== 0) {
    return dateOrder;
  }
  return right.id.localeCompare(left.id);
}

type SearchCursor = {
  version: 1;
  date: string;
  id: string;
};

function encodeSearchCursor(group: SearchableHistoryGroup): string {
  const cursor: SearchCursor = { version: 1, date: group.date, id: group.id };
  return `v1.${encodeURIComponent(JSON.stringify(cursor))}`;
}

function decodeSearchCursor(cursor: string): SearchCursor | null {
  if (!cursor.startsWith("v1.")) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(cursor.slice(3))) as Partial<SearchCursor>;
    if (parsed.version !== 1 || typeof parsed.date !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return { version: 1, date: parsed.date, id: parsed.id };
  } catch {
    return null;
  }
}

export function paginateHistoryGroups(
  groups: SearchableHistoryGroup[],
  paginationOpts: { numItems: number; cursor: string | null },
): {
  page: SearchableHistoryGroup[];
  continueCursor: string;
  isDone: boolean;
} {
  const ordered = [...groups].sort(compareHistoryGroups);
  const requestedSize = Number.isFinite(paginationOpts.numItems)
    ? Math.floor(paginationOpts.numItems)
    : 1;
  const pageSize = Math.min(Math.max(requestedSize, 1), 100);
  let startIndex = 0;

  const keysetCursor = paginationOpts.cursor ? decodeSearchCursor(paginationOpts.cursor) : null;
  if (keysetCursor !== null) {
    startIndex = ordered.findIndex(
      (group) =>
        group.date < keysetCursor.date ||
        (group.date === keysetCursor.date && group.id < keysetCursor.id),
    );
    if (startIndex < 0) {
      startIndex = ordered.length;
    }
  }

  const page = ordered.slice(startIndex, startIndex + pageSize);
  const nextIndex = startIndex + page.length;
  const isDone = nextIndex >= ordered.length;

  return {
    page,
    continueCursor:
      page.length > 0
        ? encodeSearchCursor(page[page.length - 1]!)
        : (paginationOpts.cursor ?? "v1.empty"),
    isDone,
  };
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function parseEntryType(value: string | undefined): HistoryEntryType | null {
  if (value === undefined || value === "all") {
    return "all";
  }
  if (value === "expense" || value === "income") {
    return value;
  }
  return null;
}

export function parseExpenseSearchFilters(
  input: ExpenseSearchFilterInput,
): ParsedExpenseSearchFilters {
  const filters: ExpenseSearchFilters = { entryType: "all" };
  const entryType = parseEntryType(input.entryType);
  if (entryType === null) {
    return { ok: false, error: "種別はすべて・支出・収入のいずれかで指定してください" };
  }
  filters.entryType = entryType;

  const shopQuery = input.shopQuery?.trim();
  if (shopQuery) {
    const shopQueryError = getShopQueryError(shopQuery);
    if (shopQueryError !== null) {
      return { ok: false, error: shopQueryError };
    }
    filters.shopQuery = shopQuery;
  }

  if (input.categoryId !== undefined && input.categoryId.length > 0 && entryType !== "income") {
    filters.categoryId = input.categoryId;
  }

  if (input.minAmountYen !== undefined) {
    const amountError = getAmountYenError(input.minAmountYen);
    if (amountError !== null) {
      return { ok: false, error: amountError };
    }
    filters.minAmountYen = input.minAmountYen;
  }

  if (input.maxAmountYen !== undefined) {
    const amountError = getAmountYenError(input.maxAmountYen);
    if (amountError !== null) {
      return { ok: false, error: amountError };
    }
    filters.maxAmountYen = input.maxAmountYen;
  }

  const amountRangeError = getAmountRangeError(filters.minAmountYen, filters.maxAmountYen);
  if (amountRangeError !== null) {
    return { ok: false, error: amountRangeError };
  }

  if (input.startDate !== undefined && input.startDate.length > 0) {
    const dateError = getIsoDateError(input.startDate);
    if (dateError !== null) {
      return { ok: false, error: dateError };
    }
    filters.startDate = input.startDate;
  }

  if (input.endDate !== undefined && input.endDate.length > 0) {
    const dateError = getIsoDateError(input.endDate);
    if (dateError !== null) {
      return { ok: false, error: dateError };
    }
    filters.endDate = input.endDate;
  }

  const dateRangeError = getDateRangeError(filters.startDate, filters.endDate);
  if (dateRangeError !== null) {
    return { ok: false, error: dateRangeError };
  }

  return { ok: true, filters };
}
