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

// 「カテゴリ未分類」絞り込みを表す特別な categoryId 値。
// 実際のカテゴリIDと衝突しない文字列を使う。
export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

function normalizeSearchText(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export type SearchQueryTerm = {
  raw: string;
  exclude: boolean;
};

/**
 * キーワード欄を検索語へ分解する。
 * 空白区切りはAND、先頭「-」は除外、「"..."」で囲むと空白や「-」を含む
 * 文字列をそのまま検索できる。
 */
export function parseSearchQueryTerms(query: string): SearchQueryTerm[] {
  const terms: SearchQueryTerm[] = [];
  let current = "";
  let inQuote = false;
  let tokenStartedWithQuote = false;

  const flush = () => {
    const raw = current;
    current = "";
    const startedWithQuote = tokenStartedWithQuote;
    tokenStartedWithQuote = false;
    if (raw.length === 0) {
      return;
    }
    // 「-」始まりは除外指定。引用で始まるトークンは中身をそのまま含める。
    const exclude = !startedWithQuote && raw.startsWith("-") && raw.length > 1;
    terms.push({ raw: exclude ? raw.slice(1) : raw, exclude });
  };

  for (const char of query) {
    if (char === '"') {
      if (current.length === 0 && !inQuote) {
        tokenStartedWithQuote = true;
      }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(char)) {
      flush();
      continue;
    }
    current += char;
  }
  flush();

  return terms.filter((term) => term.raw.length > 0);
}

function matchesAnyHaystack(haystacks: Array<string | undefined>, term: string): boolean {
  const normalizedTerm = normalizeSearchText(term);
  return haystacks.some((value) => normalizeSearchText(value).includes(normalizedTerm));
}

function matchesSearchTerms(
  haystacks: Array<string | undefined>,
  terms: SearchQueryTerm[],
): boolean {
  const includeTerms = terms.filter((term) => !term.exclude);
  const excludeTerms = terms.filter((term) => term.exclude);
  return (
    includeTerms.every((term) => matchesAnyHaystack(haystacks, term.raw)) &&
    !excludeTerms.some((term) => matchesAnyHaystack(haystacks, term.raw))
  );
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
  const terms = parseSearchQueryTerms(query);
  if (terms.length === 0) {
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

  return matchesSearchTerms(haystacks, terms);
}

function matchesIncomeQuery(
  group: Extract<SearchableHistoryGroup, { type: "income" }>,
  query: string,
): boolean {
  const terms = parseSearchQueryTerms(query);
  if (terms.length === 0) {
    return true;
  }

  return matchesSearchTerms([group.bankName, group.income.memo], terms);
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

    if (filters.categoryId !== undefined) {
      if (group.type === "income") {
        return false;
      }
      const matchesCategory =
        filters.categoryId === UNCATEGORIZED_CATEGORY_ID
          ? group.items.some((item) => item.categoryId.length === 0)
          : group.items.some((item) => item.categoryId === filters.categoryId);
      if (!matchesCategory) {
        return false;
      }
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
    if (shopQuery.length > SHOP_QUERY_MAX_LENGTH) {
      return { ok: false, error: `検索語は${SHOP_QUERY_MAX_LENGTH}文字以内で指定してください` };
    }
    filters.shopQuery = shopQuery;
  }

  if (input.categoryId !== undefined && input.categoryId.length > 0 && entryType !== "income") {
    filters.categoryId = input.categoryId;
  }

  if (input.minAmountYen !== undefined) {
    if (!isNonNegativeInteger(input.minAmountYen)) {
      return { ok: false, error: "金額は0以上の整数で指定してください" };
    }
    filters.minAmountYen = input.minAmountYen;
  }

  if (input.maxAmountYen !== undefined) {
    if (!isNonNegativeInteger(input.maxAmountYen)) {
      return { ok: false, error: "金額は0以上の整数で指定してください" };
    }
    filters.maxAmountYen = input.maxAmountYen;
  }

  if (
    filters.minAmountYen !== undefined &&
    filters.maxAmountYen !== undefined &&
    filters.minAmountYen > filters.maxAmountYen
  ) {
    return { ok: false, error: "金額の下限は上限以下にしてください" };
  }

  if (input.startDate !== undefined && input.startDate.length > 0) {
    if (!isValidIsoDateString(input.startDate)) {
      return { ok: false, error: "日付はYYYY-MM-DD形式で指定してください" };
    }
    filters.startDate = input.startDate;
  }

  if (input.endDate !== undefined && input.endDate.length > 0) {
    if (!isValidIsoDateString(input.endDate)) {
      return { ok: false, error: "日付はYYYY-MM-DD形式で指定してください" };
    }
    filters.endDate = input.endDate;
  }

  if (
    filters.startDate !== undefined &&
    filters.endDate !== undefined &&
    filters.startDate > filters.endDate
  ) {
    return { ok: false, error: "開始日は終了日以前にしてください" };
  }

  const trendRangeError = getHistoryTrendRangeError(filters.startDate, filters.endDate);
  if (trendRangeError !== null) {
    return { ok: false, error: trendRangeError };
  }

  return { ok: true, filters };
}
