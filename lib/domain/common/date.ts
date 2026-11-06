export const JAPAN_TIME_ZONE = "Asia/Tokyo";

export function getTodayDateStringInJapan(now: Date | number = new Date()): string {
  const date = typeof now === "number" ? new Date(now) : now;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format today's date in Japan timezone");
  }
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getMonthEndDate(monthStartDate: string): string {
  const [yearStr, monthStr] = monthStartDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  // 0〜99年を1900年代へ補正していた既存の検証結果（拒否）を維持する。
  if (!Number.isInteger(year) || year < 100 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
