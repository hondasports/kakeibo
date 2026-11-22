import {
  parseExpenseSearchFilters,
  type HistoryEntryType,
} from "../../../../lib/domain/expenseSearch/filter";
import { getHistoryTrendRangeError } from "../../../../lib/domain/expenseSearch/trendRange";
import { isValidIsoDateString } from "../../../../lib/domain/week/weekDates";
import type { Id } from "../../../../convex/_generated/dataModel";

export type ExpenseSearchFormState = {
  entryType: HistoryEntryType;
  shopQuery: string;
  categoryId: string;
  minAmountYen: string;
  maxAmountYen: string;
  startDate: string;
  endDate: string;
};

export const EMPTY_EXPENSE_SEARCH_FORM: ExpenseSearchFormState = {
  entryType: "all",
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
  return {
    entryType: normalizedEntryType,
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
      (diff as ExpenseSearchFormState)[key] = after[key];
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

const SHOP_QUERY_MAX_LENGTH = 80;

// エラー文言は lib/domain/expenseSearch/filter.ts の parseExpenseSearchFilters と揃える。
// parse は先頭の1件だけ返すため、項目ごとの近接表示にはこちらで各フィールドへ割り当てる。
export function validateExpenseSearchForm(
  state: ExpenseSearchFormState,
): ExpenseSearchFormValidation {
  const fieldErrors: ExpenseSearchFieldErrors = {};

  if (state.shopQuery.trim().length > SHOP_QUERY_MAX_LENGTH) {
    fieldErrors.shopQuery = `検索語は${SHOP_QUERY_MAX_LENGTH}文字以内で指定してください`;
  }

  const minAmountYen = parseOptionalInteger(state.minAmountYen);
  const maxAmountYen = parseOptionalInteger(state.maxAmountYen);
  if (Number.isNaN(minAmountYen)) {
    fieldErrors.minAmountYen = "金額は0以上の整数で指定してください";
  }
  if (Number.isNaN(maxAmountYen)) {
    fieldErrors.maxAmountYen = "金額は0以上の整数で指定してください";
  }
  if (
    minAmountYen !== undefined &&
    maxAmountYen !== undefined &&
    !Number.isNaN(minAmountYen) &&
    !Number.isNaN(maxAmountYen) &&
    minAmountYen > maxAmountYen
  ) {
    fieldErrors.minAmountYen = "金額の下限は上限以下にしてください";
  }

  const hasStartDate = state.startDate.length > 0;
  const hasEndDate = state.endDate.length > 0;
  const startDateValid = !hasStartDate || isValidIsoDateString(state.startDate);
  const endDateValid = !hasEndDate || isValidIsoDateString(state.endDate);
  if (!startDateValid) {
    fieldErrors.startDate = "日付はYYYY-MM-DD形式で指定してください";
  }
  if (!endDateValid) {
    fieldErrors.endDate = "日付はYYYY-MM-DD形式で指定してください";
  }
  if (startDateValid && endDateValid) {
    if (hasStartDate && hasEndDate && state.startDate > state.endDate) {
      fieldErrors.startDate = "開始日は終了日以前にしてください";
    } else {
      const trendRangeError = getHistoryTrendRangeError(
        hasStartDate ? state.startDate : undefined,
        hasEndDate ? state.endDate : undefined,
      );
      if (trendRangeError !== null) {
        fieldErrors.startDate = trendRangeError;
      }
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
      shopQuery: parsed.filters.shopQuery,
      categoryId: parsed.filters.categoryId
        ? (parsed.filters.categoryId as Id<"categories">)
        : undefined,
      minAmountYen: parsed.filters.minAmountYen,
      maxAmountYen: parsed.filters.maxAmountYen,
      startDate: parsed.filters.startDate,
      endDate: parsed.filters.endDate,
    },
  };
}
