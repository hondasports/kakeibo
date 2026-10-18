import { normalizeMonth } from "../lib/monthNavigation";
import { WEEKDAY_LABELS as CALENDAR_WEEKDAY_LABELS } from "../../../utils/date";

export { CALENDAR_WEEKDAY_LABELS };

export type MonthlyCalendarDay = {
  date: string;
  dayOfMonth: number;
  expenseAmountYen: number;
  expenseCount: number;
  incomeAmountYen: number;
  incomeCount: number;
};

export type MonthlySpendingCalendarData = {
  cells: Array<MonthlyCalendarDay | null>;
  days: MonthlyCalendarDay[];
  maxExpenseAmountYen: number;
};

type CalendarEntry = {
  date: string;
  amountYen: number;
};

type DailyAmount = {
  amountYen: number;
  count: number;
};

function getDaysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function getFirstWeekday(month: string): number {
  return new Date(`${month}-01T00:00:00Z`).getUTCDay();
}

function aggregateByDate(entries: CalendarEntry[], month: string): Map<string, DailyAmount> {
  const totals = new Map<string, DailyAmount>();

  for (const entry of entries) {
    if (!isDateInMonth(entry.date, month)) {
      continue;
    }

    const existing = totals.get(entry.date) ?? { amountYen: 0, count: 0 };
    const amountYen = Number.isFinite(entry.amountYen) ? Math.max(0, entry.amountYen) : 0;
    totals.set(entry.date, {
      amountYen: existing.amountYen + amountYen,
      count: existing.count + 1,
    });
  }

  return totals;
}

export function isDateInMonth(date: string, month: string): boolean {
  const normalizedMonth = normalizeMonth(month);
  if (normalizedMonth === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const normalizedDate = parsedDate.toISOString().slice(0, 10);
  return normalizedDate === date && date.startsWith(`${normalizedMonth}-`);
}

export function getExpenseIntensity(
  amountYen: number,
  maxExpenseAmountYen: number,
): 0 | 1 | 2 | 3 | 4 {
  if (amountYen <= 0 || maxExpenseAmountYen <= 0) {
    return 0;
  }

  return Math.min(4, Math.max(1, Math.ceil((amountYen / maxExpenseAmountYen) * 4))) as
    | 1
    | 2
    | 3
    | 4;
}

export function buildMonthlySpendingCalendarData({
  month,
  expenses,
  incomes,
}: {
  month: string;
  expenses: CalendarEntry[];
  incomes: CalendarEntry[];
}): MonthlySpendingCalendarData {
  const normalizedMonth = normalizeMonth(month);
  if (normalizedMonth === null) {
    return { cells: [], days: [], maxExpenseAmountYen: 0 };
  }

  const expenseTotals = aggregateByDate(expenses, normalizedMonth);
  const incomeTotals = aggregateByDate(incomes, normalizedMonth);
  const days = Array.from({ length: getDaysInMonth(normalizedMonth) }, (_, index) => {
    const dayOfMonth = index + 1;
    const date = `${normalizedMonth}-${String(dayOfMonth).padStart(2, "0")}`;
    const expense = expenseTotals.get(date) ?? { amountYen: 0, count: 0 };
    const income = incomeTotals.get(date) ?? { amountYen: 0, count: 0 };

    return {
      date,
      dayOfMonth,
      expenseAmountYen: expense.amountYen,
      expenseCount: expense.count,
      incomeAmountYen: income.amountYen,
      incomeCount: income.count,
    };
  });
  const maxExpenseAmountYen = Math.max(...days.map((day) => day.expenseAmountYen), 0);
  const leadingEmptyCells = Array.from({ length: getFirstWeekday(normalizedMonth) }, () => null);
  const cells: Array<MonthlyCalendarDay | null> = [...leadingEmptyCells, ...days];

  while (cells.length % CALENDAR_WEEKDAY_LABELS.length !== 0) {
    cells.push(null);
  }

  return { cells, days, maxExpenseAmountYen };
}
