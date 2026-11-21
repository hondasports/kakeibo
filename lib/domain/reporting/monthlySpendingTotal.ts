import { getMonthEndDate } from "../common/date";

type SpendingRow = { date: string; amount: number };

export function calculateMonthlySpendingTotal(rows: readonly SpendingRow[], now: Date): number {
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;
  const monthEnd = getMonthEndDate(monthStart);

  return rows.reduce(
    (total, row) => (row.date >= monthStart && row.date <= monthEnd ? total + row.amount : total),
    0,
  );
}
