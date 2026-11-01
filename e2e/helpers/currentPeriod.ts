/**
 * E2E の「今週」「今月」は JST 基準で、週開始曜日は既定の月曜とする。
 * page.clock.setFixedTime では Convex 側の時刻が変わらないため使わない。
 */
import { getTodayDateStringInJapan } from "../../lib/domain/common/date";
import {
  calculateRelativeWeekStartDate,
  calculateWeekStartDate,
  DEFAULT_WEEK_START_DAY,
} from "../../lib/domain/week/weekDates";

export function getCurrentWeekStartDate(now: Date | number = new Date()): string {
  return calculateWeekStartDate(getTodayDateStringInJapan(now), DEFAULT_WEEK_START_DAY);
}

export { getCurrentMonth } from "../../lib/domain/common/month";

export function addWeeks(weekStartDate: string, weeks: number): string {
  return calculateRelativeWeekStartDate(weekStartDate, weeks);
}
