export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateTimeWithSecondsFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * ISO 形式の日付文字列 (YYYY-MM-DD) を "M/D" 形式にフォーマットする。
 * 例: "2026-05-18" → "5/18"
 */
export function formatDateForDisplay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * ISO 形式の日付文字列 (YYYY-MM-DD) を "YYYY/M/D" 形式にフォーマットする。
 * 年をまたぐ一覧で、いつの記録かを示すために使う。
 * 例: "2023-06-01" → "2023/6/1"
 */
export function formatDateWithYearForDisplay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${String(d.getFullYear()).padStart(4, "0")}/${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Unix タイムスタンプを日本語の日時表記に変換する。
 */
export function formatDateTimeForDisplay(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

/**
 * Unix タイムスタンプを秒まで含む日本語の日時表記に変換する。
 * 監査ログのように秒精度が必要な場面で使う。
 */
export function formatDateTimeWithSecondsForDisplay(timestamp: number): string {
  return dateTimeWithSecondsFormatter.format(new Date(timestamp));
}

/**
 * ISO 形式の日付文字列 (YYYY-MM-DD) を "M/D（曜）" 形式にフォーマットする。
 * 例: "2026-05-18" → "5/18（月）"
 */
export function formatShortDateWithWeekday(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayLabel = WEEKDAY_LABELS[date.getDay()];
  return `${month}/${day}（${dayLabel}）`;
}

/**
 * ISO 形式の日付文字列 (YYYY-MM-DD) を "YYYY年M月D日" 形式にフォーマットする。
 * 例: "2026-07-09" → "2026年7月9日"
 */
export function formatJapaneseDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
