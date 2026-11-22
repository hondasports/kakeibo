import {
  DEFAULT_HISTORY_SORT_ORDER,
  getAmountRangeError,
  getAmountYenError,
  getDateRangeError,
  getIsoDateError,
  getShopQueryError,
  HISTORY_SORT_ORDERS,
  parseExpenseSearchFilters,
  type HistoryEntryType,
  type HistorySortOrder,
} from "../../../../lib/domain/expenseSearch/filter";
import type { Id } from "../../../../convex/_generated/dataModel";

export type ExpenseSearchFormState = {
  entryType: HistoryEntryType;
  sortOrder: HistorySortOrder;
  shopQuery: string;
  categoryId: string;
  minAmountYen: string;
  maxAmountYen: string;
  startDate: string;
  endDate: string;
};

export const EMPTY_EXPENSE_SEARCH_FORM: ExpenseSearchFormState = {
  entryType: "all",
  sortOrder: DEFAULT_HISTORY_SORT_ORDER,
  shopQuery: "",
  categoryId: "",
  minAmountYen: "",
  maxAmountYen: "",
  startDate: "",
  endDate: "",
};

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return Number.NaN;
  }
  return Number.parseInt(trimmed, 10);
}

export function readExpenseSearchFormState(searchParams: URLSearchParams): ExpenseSearchFormState {
  const entryType = searchParams.get("type");
  const normalizedEntryType: HistoryEntryType =
    entryType === "expense" || entryType === "income" || entryType === "all" ? entryType : "all";
  const sortOrderParam = searchParams.get("sort");
  return {
    entryType: normalizedEntryType,
    sortOrder: (HISTORY_SORT_ORDERS as readonly string[]).includes(sortOrderParam ?? "")
      ? (sortOrderParam as HistorySortOrder)
      : DEFAULT_HISTORY_SORT_ORDER,
    shopQuery: searchParams.get("q") ?? "",
    categoryId: normalizedEntryType === "income" ? "" : (searchParams.get("categoryId") ?? ""),
    minAmountYen: searchParams.get("min") ?? "",
    maxAmountYen: searchParams.get("max") ?? "",
    startDate: searchParams.get("from") ?? "",
    endDate: searchParams.get("to") ?? "",
  };
}

export function expenseSearchFormToSearchParams(state: ExpenseSearchFormState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.entryType !== "all") params.set("type", state.entryType);
  if (state.sortOrder !== DEFAULT_HISTORY_SORT_ORDER) params.set("sort", state.sortOrder);
  if (state.shopQuery.trim()) params.set("q", state.shopQuery.trim());
  if (state.categoryId && state.entryType !== "income") params.set("categoryId", state.categoryId);
  if (state.minAmountYen.trim()) params.set("min", state.minAmountYen.trim());
  if (state.maxAmountYen.trim()) params.set("max", state.maxAmountYen.trim());
  if (state.startDate) params.set("from", state.startDate);
  if (state.endDate) params.set("to", state.endDate);
  return params;
}

export function expenseSearchPath(state: ExpenseSearchFormState): string {
  const params = expenseSearchFormToSearchParams(state);
  const query = params.toString();
  return query.length > 0 ? `/search?${query}` : "/search";
}

export function parseExpenseSearchFormState(state: ExpenseSearchFormState) {
  const minAmountYen = parseOptionalInteger(state.minAmountYen);
  const maxAmountYen = parseOptionalInteger(state.maxAmountYen);
  if (Number.isNaN(minAmountYen) || Number.isNaN(maxAmountYen)) {
    return { ok: false as const, error: "金額は0以上の整数で指定してください" };
  }

  return parseExpenseSearchFilters({
    entryType: state.entryType,
    sortOrder: state.sortOrder,
    shopQuery: state.shopQuery,
    categoryId: state.categoryId || undefined,
    minAmountYen,
    maxAmountYen,
    startDate: state.startDate || undefined,
    endDate: state.endDate || undefined,
  });
}

export function diffExpenseSearchFormState(
  before: ExpenseSearchFormState,
  after: ExpenseSearchFormState,
): Partial<ExpenseSearchFormState> {
  const diff: Partial<ExpenseSearchFormState> = {};
  for (const key of Object.keys(before) as Array<keyof ExpenseSearchFormState>) {
    if (before[key] !== after[key]) {
      (diff as Record<keyof ExpenseSearchFormState, unknown>)[key] = after[key];
    }
  }
  return diff;
}

export type ExpenseSearchFieldErrors = Partial<
  Record<"shopQuery" | "minAmountYen" | "maxAmountYen" | "startDate" | "endDate", string>
>;

export type ExpenseSearchFormValidation = {
  ok: boolean;
  fieldErrors: ExpenseSearchFieldErrors;
  formError: string | null;
};

// 判定・文言は lib/domain/expenseSearch/filter.ts が正本。
// parse は先頭の1件だけ返すため、項目ごとの近接表示にはこちらで各フィールドへ割り当てる。
export function validateExpenseSearchForm(
  state: ExpenseSearchFormState,
): ExpenseSearchFormValidation {
  const fieldErrors: ExpenseSearchFieldErrors = {};

  const shopQueryError = getShopQueryError(state.shopQuery.trim());
  if (shopQueryError !== null) {
    fieldErrors.shopQuery = shopQueryError;
  }

  const minAmountYen = parseOptionalInteger(state.minAmountYen);
  const maxAmountYen = parseOptionalInteger(state.maxAmountYen);
  if (minAmountYen !== undefined) {
    const error = getAmountYenError(minAmountYen);
    if (error !== null) {
      fieldErrors.minAmountYen = error;
    }
  }
  if (maxAmountYen !== undefined) {
    const error = getAmountYenError(maxAmountYen);
    if (error !== null) {
      fieldErrors.maxAmountYen = error;
    }
  }
  if (fieldErrors.minAmountYen === undefined && fieldErrors.maxAmountYen === undefined) {
    const rangeError = getAmountRangeError(minAmountYen, maxAmountYen);
    if (rangeError !== null) {
      fieldErrors.minAmountYen = rangeError;
    }
  }

  const startDate = state.startDate.length > 0 ? state.startDate : undefined;
  const endDate = state.endDate.length > 0 ? state.endDate : undefined;
  if (startDate !== undefined) {
    const error = getIsoDateError(startDate);
    if (error !== null) {
      fieldErrors.startDate = error;
    }
  }
  if (endDate !== undefined) {
    const error = getIsoDateError(endDate);
    if (error !== null) {
      fieldErrors.endDate = error;
    }
  }
  if (fieldErrors.startDate === undefined && fieldErrors.endDate === undefined) {
    const rangeError = getDateRangeError(startDate, endDate);
    if (rangeError !== null) {
      fieldErrors.startDate = rangeError;
    }
  }

  const ok = Object.keys(fieldErrors).length === 0;
  // フィールドに割り当てられないエラー（将来追加される検証など）だけフォーム全体のエラーとして残す。
  const parsed = parseExpenseSearchFormState(state);
  const formError = !ok || parsed.ok ? null : parsed.error;
  return { ok, fieldErrors, formError };
}

export function toExpenseSearchQueryArgs(state: ExpenseSearchFormState) {
  const parsed = parseExpenseSearchFormState(state);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true as const,
    args: {
      entryType: parsed.filters.entryType,
      sortOrder: parsed.filters.sortOrder,
      shopQuery: parsed.filters.shopQuery,
      categoryId: parsed.filters.categoryId
        ? (parsed.filters.categoryId as Id<"categories"> | "__uncategorized__")
        : undefined,
      minAmountYen: parsed.filters.minAmountYen,
      maxAmountYen: parsed.filters.maxAmountYen,
      startDate: parsed.filters.startDate,
      endDate: parsed.filters.endDate,
    },
  };
}
