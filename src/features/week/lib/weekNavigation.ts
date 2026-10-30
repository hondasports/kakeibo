import {
  addDays as addDomainDays,
  getTodayDateStringInJapan,
} from "../../../../lib/domain/common/date";
import {
  calculateRelativeWeekStartDate,
  calculateWeekEndDate,
  calculateWeekStartDate,
  DEFAULT_WEEK_START_DAY,
  getWeekEndDay,
  normalizeWeekStartDay,
} from "../../../../lib/domain/week/weekDates";
import { WEEKDAY_LABELS } from "../../../utils/date";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export { DEFAULT_WEEK_START_DAY, getWeekEndDay, normalizeWeekStartDay };

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(dateStr: string): Date | null {
  if (!ISO_DATE_PATTERN.test(dateStr)) {
    return null;
  }

  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== dateStr) {
    return null;
  }

  return date;
}

export function normalizeWeekStartDate(
  dateStr: string,
  weekStartDay: number = DEFAULT_WEEK_START_DAY,
): string | null {
  const date = parseIsoDate(dateStr);
  if (date === null) {
    return null;
  }

  return calculateWeekStartDate(dateStr, weekStartDay);
}

export function addDays(dateStr: string, days: number): string {
  const date = parseIsoDate(dateStr);
  if (date === null) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  return addDomainDays(dateStr, days);
}

export function addWeeks(weekStartDate: string, weeks: number): string {
  const date = parseIsoDate(weekStartDate);
  if (date === null) {
    throw new Error(`Invalid weekStartDate: ${weekStartDate}`);
  }

  return calculateRelativeWeekStartDate(weekStartDate, weeks);
}

export function getWeekEndDate(weekStartDate: string): string {
  const date = parseIsoDate(weekStartDate);
  if (date === null) {
    throw new Error(`Invalid weekStartDate: ${weekStartDate}`);
  }

  return calculateWeekEndDate(weekStartDate);
}

export function isFutureWeek(weekStartDate: string, currentWeekStartDate: string): boolean {
  return weekStartDate > currentWeekStartDate;
}

/** JST の現在日付から指定曜日始まりの週開始日を計算する。 */
export function getCurrentWeekStartDate(weekStartDay: number = DEFAULT_WEEK_START_DAY): string {
  return calculateWeekStartDate(getTodayDateStringInJapan(), weekStartDay);
}

/**
 * weekStartDate から weekEndDate までの日付リストを生成する。
 */
export function generateWeekDays(
  weekStartDate: string,
  weekEndDate: string,
): Array<{ label: string; date: string; isoDate: string }> {
  const days: Array<{ label: string; date: string; isoDate: string }> = [];
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(weekEndDate + "T00:00:00");

  const current = new Date(start);
  while (current <= end) {
    const m = current.getMonth() + 1;
    const d = current.getDate();
    const y = current.getFullYear();
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    days.push({
      label: WEEKDAY_LABELS[current.getDay()],
      date: `${m}/${d}`,
      isoDate: `${y}-${mm}-${dd}`,
    });
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * 週の開始日と終了日を日本語形式の文字列にフォーマットする。
 * 例: "2026年5月18日 - 5月24日"
 */
export function formatWeekPeriod(weekStartDate: string, weekEndDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00");
  const end = new Date(weekEndDate + "T00:00:00");
  const sy = start.getFullYear();
  const sm = start.getMonth() + 1;
  const sd = start.getDate();
  const em = end.getMonth() + 1;
  const ed = end.getDate();
  return `${sy}年${sm}月${sd}日 - ${em}月${ed}日`;
}
