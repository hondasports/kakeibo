import { addDays, getMonthEndDate } from "../common/date";
import type { EntryKind } from "../common/entryKind";
import { calculateWeekStartDate, isValidIsoDateString } from "../week/weekDates";
import {
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "../expenseEntries/expenseEntryItem";

export const RECURRING_FREQUENCIES = ["weekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type RecurringRuleInput = {
  kind: EntryKind;
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

/** 二重登録防止のために保持する登録済み発生日の最大件数。 */
export const MAX_REGISTERED_DATES = 90;

export type RecurringRule = RecurringRuleInput & {
  active: boolean;
  /** 登録済みの発生日（YYYY-MM-DD）の履歴。直近の全発生日を保持する。
      二重登録の判定は発生日そのものではなく期間キー（monthlyはYYYY-MM、
      weeklyは発生日を含む週の開始日）で行うため、条件変更で発生日が
      移動しても同じ期間には1回しか登録できない */
  registeredForDates?: string[];
};

export type RecurringRuleValidation = { success: true } | { success: false; message: string };

export function validateRecurringRuleInput(input: RecurringRuleInput): RecurringRuleValidation {
  // 登録時に実績エントリへ転記するため、実績側の制約（タイトル100字・メモ500字・
  // 金額上限）と同じ条件で検証する。ここで受け入れないと「保存できるが登録できない」定義になる。
  const titleResult = validateExpenseTitle(input.title);
  if (!titleResult.success) {
    return {
      success: false,
      message:
        titleResult.error === "empty"
          ? "項目名を入力してください"
          : "項目名は100文字以内で入力してください",
    };
  }
  const amountResult = validateExpenseAmount(input.amountYen);
  if (!amountResult.success) {
    return {
      success: false,
      message: "金額は1円以上9,999,999円以下の整数で入力してください",
    };
  }
  const memoResult = validateExpenseMemo(input.memo);
  if (!memoResult.success) {
    return { success: false, message: "メモは500文字以内で入力してください" };
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

/**
 * 二重登録の判定に使う期間キー。
 * monthly は "YYYY-MM"、weekly は発生日を含む週の開始日（月曜始まり）。
 * 発生日そのものではなく期間で比較するため、繰り返し条件の変更
 * （25日→1日、月曜→金曜など）で同じ期間に2件登録できない。
 */
export function recurringRegistrationKey(
  input: Pick<RecurringRuleInput, "frequency">,
  occurrenceDate: string,
): string {
  if (input.frequency === "monthly") {
    return occurrenceDate.slice(0, 7);
  }
  return calculateWeekStartDate(occurrenceDate);
}

/**
 * occurrence の期間がすでに登録済みか。
 * 保存されている発生日も現在の頻度で期間キーへ変換して比較する
 * （weekly→monthly への変更後も同じ期間は再登録されない）。
 */
export function isOccurrenceRegistered(rule: RecurringRule, occurrence: string): boolean {
  const key = recurringRegistrationKey(rule, occurrence);
  return (rule.registeredForDates ?? []).some(
    (date) => recurringRegistrationKey(rule, date) === key,
  );
}

/** 登録が必要な状態（発生日が到来していて未登録）か。 */
export function isRuleDue(rule: RecurringRule, today: string): boolean {
  if (!rule.active || !isValidIsoDateString(today)) {
    return false;
  }
  const occurrence = latestOccurrenceDate(rule, today);
  return !isOccurrenceRegistered(rule, occurrence);
}
