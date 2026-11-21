import { addDays, getMonthEndDate, getTodayDateStringInJapan } from "../common/date";
import { addMonths, getMonthStartDate } from "../common/month";
import { calculateWeekStartDate, normalizeWeekStartDay } from "../week/weekDates";

export type HistoryDatePreset =
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "thisYear"
  | "custom";

type HistoryDateRange = {
  startDate: string;
  endDate: string;
};

function clampEndDate(endDate: string, todayDate: string): string {
  return endDate > todayDate ? todayDate : endDate;
}

export function getHistoryDateRangeForPreset(
  preset: Exclude<HistoryDatePreset, "custom">,
  todayDate: string = getTodayDateStringInJapan(),
  weekStartDay: number = 1,
): HistoryDateRange {
  switch (preset) {
    case "thisWeek": {
      const startDate = calculateWeekStartDate(todayDate, normalizeWeekStartDay(weekStartDay));
      return { startDate, endDate: clampEndDate(addDays(startDate, 6), todayDate) };
    }
    case "thisMonth": {
      const month = todayDate.slice(0, 7);
      return { startDate: getMonthStartDate(month), endDate: todayDate };
    }
    case "lastMonth": {
      const month = addMonths(todayDate.slice(0, 7), -1);
      return {
        startDate: getMonthStartDate(month),
        endDate: getMonthEndDate(getMonthStartDate(month)),
      };
    }
    case "last3Months": {
      const month = addMonths(todayDate.slice(0, 7), -2);
      return { startDate: getMonthStartDate(month), endDate: todayDate };
    }
    case "thisYear": {
      return { startDate: `${todayDate.slice(0, 4)}-01-01`, endDate: todayDate };
    }
  }
}

export function getHistoryDatePresetForRange(
  range: HistoryDateRange,
  todayDate: string = getTodayDateStringInJapan(),
  weekStartDay: number = 1,
): HistoryDatePreset {
  const presets: Array<Exclude<HistoryDatePreset, "custom">> = [
    "thisWeek",
    "thisMonth",
    "lastMonth",
    "last3Months",
    "thisYear",
  ];
  const matched = presets.find((preset) => {
    const presetRange = getHistoryDateRangeForPreset(preset, todayDate, weekStartDay);
    return presetRange.startDate === range.startDate && presetRange.endDate === range.endDate;
  });
  return matched ?? "custom";
}
