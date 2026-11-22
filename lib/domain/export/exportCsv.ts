// /export のCSV生成。円整数・日付はYYYY-MM-DDのまま出力し、
// 金額・件数がサマリー・履歴検索と照合できるようにする。
export type ExportEntryKind = "expense" | "income";

export type ExportCsvRow = {
  date: string;
  kind: ExportEntryKind;
  title: string;
  categoryName: string;
  amountYen: number;
  memo: string;
};

export const EXPORT_CSV_HEADERS = ["日付", "種別", "タイトル", "カテゴリ", "金額", "メモ"] as const;

const KIND_LABELS: Record<ExportEntryKind, string> = {
  expense: "支出",
  income: "収入",
};

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildExportCsv(rows: ExportCsvRow[]): string {
  const lines = rows.map((row) =>
    [row.date, KIND_LABELS[row.kind], row.title, row.categoryName, String(row.amountYen), row.memo]
      .map(csvEscape)
      .join(","),
  );
  return [EXPORT_CSV_HEADERS.join(","), ...lines].join("\r\n");
}

// 1回のクエリに読み取り上限があるため、期間は月単位に分割して取得する。
export function splitDateRangeIntoMonths(
  startDate: string,
  endDate: string,
): Array<{ startDate: string; endDate: string }> {
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= last) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    ranges.push({
      startDate: monthStart < startDate ? startDate : monthStart,
      endDate: monthEnd > endDate ? endDate : monthEnd,
    });
    cursor = new Date(Date.UTC(year, month + 1, 1));
  }
  return ranges;
}
