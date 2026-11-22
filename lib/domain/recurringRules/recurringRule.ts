import { addDays, getMonthEndDate } from "../common/date";
import { isValidIsoDateString } from "../week/weekDates";

export const RECURRING_FREQUENCIES = ["weekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type RecurringRuleInput = {
  kind: "expense" | "income";
  title: string;
  amountYen: number;
  categoryId?: string;
  shopName?: string;
  memo?: string;
  frequency: RecurringFrequency;
  /** weekly のとき必須。0=日曜〜6=土曜 */
  dayOfWeek?: number;
  /** monthly のとき必須。1-31。月末を超える場合はその月の末日に丸める */
  dayOfMonth?: number;
};

export type RecurringRule = RecurringRuleInput & {
  active: boolean;
  /** 最後に登録した発生日（YYYY-MM-DD）。同じ発生日の二重登録を防ぐ */
  lastRegisteredFor?: string;
};

export type RecurringRuleValidation = { success: true } | { success: false; message: string };

export function validateRecurringRuleInput(input: RecurringRuleInput): RecurringRuleValidation {
  if (!input.title.trim()) {
    return { success: false, message: "項目名を入力してください" };
  }
  if (!Number.isInteger(input.amountYen) || input.amountYen <= 0) {
    return { success: false, message: "金額は1円以上の整数で入力してください" };
  }
  if (input.kind === "expense" && !input.categoryId) {
    return { success: false, message: "支出の定期定義にはカテゴリが必要です" };
  }
  if (input.frequency === "weekly") {
    if (
      input.dayOfWeek === undefined ||
      !Number.isInteger(input.dayOfWeek) ||
      input.dayOfWeek < 0 ||
      input.dayOfWeek > 6
    ) {
      return { success: false, message: "毎週の定期定義には曜日を指定してください" };
    }
  } else {
    if (
      input.dayOfMonth === undefined ||
      !Number.isInteger(input.dayOfMonth) ||
      input.dayOfMonth < 1 ||
      input.dayOfMonth > 31
    ) {
      return {
        success: false,
        message: "毎月の定期定義には1〜31の日付を指定してください",
      };
    }
  }
  return { success: true };
}

/** その月で有効な発生日（31日指定の2月は28/29日に丸める）。 */
function effectiveDayOfMonth(dayOfMonth: number, monthStartDate: string): number {
  const monthEnd = getMonthEndDate(monthStartDate);
  return Math.min(dayOfMonth, Number(monthEnd.slice(8, 10)));
}

/**
 * today 以前（today を含む）の直近の発生日を YYYY-MM-DD で返す。
 * 日付はJST前提のカレンダー文字列として計算する。
 */
export function latestOccurrenceDate(
  input: Pick<RecurringRuleInput, "frequency" | "dayOfWeek" | "dayOfMonth">,
  today: string,
): string {
  if (input.frequency === "weekly") {
    const todayDay = new Date(today + "T00:00:00Z").getUTCDay();
    const diff = (todayDay - (input.dayOfWeek ?? 0) + 7) % 7;
    return addDays(today, -diff);
  }
  const monthStart = today.slice(0, 8) + "01";
  const day = effectiveDayOfMonth(input.dayOfMonth ?? 1, monthStart);
  if (Number(today.slice(8, 10)) >= day) {
    return `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
  }
  const prevMonthStart = addDays(monthStart, -1).slice(0, 8) + "01";
  const prevDay = effectiveDayOfMonth(input.dayOfMonth ?? 1, prevMonthStart);
  return `${prevMonthStart.slice(0, 8)}${String(prevDay).padStart(2, "0")}`;
}

/** 登録が必要な状態（発生日が到来していて未登録）か。 */
export function isRuleDue(rule: RecurringRule, today: string): boolean {
  if (!rule.active || !isValidIsoDateString(today)) {
    return false;
  }
  const occurrence = latestOccurrenceDate(rule, today);
  return rule.lastRegisteredFor !== occurrence;
}
