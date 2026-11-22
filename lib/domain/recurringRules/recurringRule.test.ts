import { describe, expect, it } from "vitest";
import { isRuleDue, latestOccurrenceDate, validateRecurringRuleInput } from "./recurringRule";

describe("validateRecurringRuleInput", () => {
  const base = {
    kind: "expense" as const,
    title: "家賃",
    amountYen: 80_000,
    categoryId: "cat-1",
    frequency: "monthly" as const,
    dayOfMonth: 25,
  };

  it("正常な入力を通す", () => {
    expect(validateRecurringRuleInput(base).success).toBe(true);
    expect(
      validateRecurringRuleInput({
        ...base,
        frequency: "weekly",
        dayOfMonth: undefined,
        dayOfWeek: 3,
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ ...base, title: " " }, "項目名"],
    [{ ...base, amountYen: 0 }, "金額"],
    [{ ...base, kind: "income" as const, categoryId: undefined }, true],
    [{ ...base, categoryId: undefined }, "カテゴリ"],
    [{ ...base, dayOfMonth: 0 }, "日付"],
    [{ ...base, dayOfMonth: 32 }, "日付"],
    [{ ...base, frequency: "weekly" as const, dayOfWeek: 7 }, "曜日"],
    [{ ...base, frequency: "weekly" as const, dayOfWeek: undefined }, "曜日"],
  ])("不正な入力を弾く %#", (input, expected) => {
    const result = validateRecurringRuleInput(input);
    if (expected === true) {
      // 収入はカテゴリなしで通る
      expect(result.success).toBe(true);
    } else {
      expect(result.success).toBe(false);
    }
  });
});

describe("latestOccurrenceDate", () => {
  it.each([
    // weekly: 今日が該当曜日なら今日、過ぎていれば直前の同曜日
    ["weekly", { dayOfWeek: 3 }, "2026-11-22" /* 日曜 */, "2026-11-18" /* 水曜 */],
    ["weekly", { dayOfWeek: 0 }, "2026-11-22", "2026-11-22"],
    ["weekly", { dayOfWeek: 6 }, "2026-11-22", "2026-11-21"],
    // monthly: 今日が指定日以降なら今月、まだなら先月
    ["monthly", { dayOfMonth: 15 }, "2026-11-22", "2026-11-15"],
    ["monthly", { dayOfMonth: 25 }, "2026-11-22", "2026-10-25"],
    ["monthly", { dayOfMonth: 1 }, "2026-11-01", "2026-11-01"],
    // 月末丸め: 31日指定の2月は末日、4月(30日)も末日
    ["monthly", { dayOfMonth: 31 }, "2026-03-01", "2026-02-28"],
    ["monthly", { dayOfMonth: 31 }, "2026-04-30", "2026-04-30"],
    ["monthly", { dayOfMonth: 31 }, "2026-05-01", "2026-04-30"],
    // 年またぎ
    ["monthly", { dayOfMonth: 25 }, "2026-01-10", "2025-12-25"],
  ])("frequency=%s %o today=%s → %s", (frequency, days, today, expected) => {
    expect(latestOccurrenceDate({ frequency, ...days } as never, today)).toBe(expected);
  });
});

describe("validateRecurringRuleInput の実績側制約", () => {
  const base = {
    kind: "expense" as const,
    title: "家賃",
    amountYen: 80_000,
    categoryId: "cat-1",
    frequency: "monthly" as const,
    dayOfMonth: 22,
  };

  it("タイトル100文字超は実績作成が失敗するため拒否する", () => {
    expect(validateRecurringRuleInput({ ...base, title: "あ".repeat(101) }).success).toBe(false);
    expect(validateRecurringRuleInput({ ...base, title: "あ".repeat(100) }).success).toBe(true);
  });

  it("メモ500文字超は拒否する", () => {
    expect(validateRecurringRuleInput({ ...base, memo: "あ".repeat(501) }).success).toBe(false);
  });

  it("金額9,999,999円超は拒否する", () => {
    expect(validateRecurringRuleInput({ ...base, amountYen: 10_000_000 }).success).toBe(false);
    expect(validateRecurringRuleInput({ ...base, amountYen: 9_999_999 }).success).toBe(true);
  });
});

describe("isRuleDue", () => {
  const rule = {
    kind: "expense" as const,
    title: "家賃",
    amountYen: 80_000,
    categoryId: "cat-1",
    frequency: "monthly" as const,
    dayOfMonth: 22,
    active: true,
  };

  it("発生日が今日なら登録が必要", () => {
    expect(isRuleDue(rule, "2026-11-22")).toBe(true);
  });

  it("発生日が未来ならまだ不要…ではなく、直近の発生日は先月分", () => {
    // dayOfMonth=25 で今日=11/22 → 直近発生日は10/25。未登録なら due。
    expect(isRuleDue({ ...rule, dayOfMonth: 25 }, "2026-11-22")).toBe(true);
    // その発生日を登録済みなら due でない。
    expect(
      isRuleDue({ ...rule, dayOfMonth: 25, registeredForDates: ["2026-10-25"] }, "2026-11-22"),
    ).toBe(false);
  });

  it("条件変更で発生日が移っても登録済みの発生日は再登録しない", () => {
    // 10/25 に登録済み → 条件を 22日に戻しても直近発生日 11/22 が未登録なら due。
    expect(isRuleDue({ ...rule, registeredForDates: ["2026-10-25"] }, "2026-11-22")).toBe(true);
    // 11/22 も登録済みなら due でない。
    expect(
      isRuleDue({ ...rule, registeredForDates: ["2026-10-25", "2026-11-22"] }, "2026-11-22"),
    ).toBe(false);
  });

  it("停止中は登録不要", () => {
    expect(isRuleDue({ ...rule, active: false }, "2026-11-22")).toBe(false);
  });

  it("発生日の日付を変えても、同じ月には再登録できない", () => {
    // 11/25 に登録済み → 条件を毎月1日に変えても、11/1 は同じ "2026-11" のため登録不要。
    const moved = { ...rule, dayOfMonth: 1, registeredForDates: ["2026-11-25"] };
    expect(isRuleDue(moved, "2026-11-30")).toBe(false);
    // 翌月（12/1）になれば別期間なので due になる。
    expect(isRuleDue(moved, "2026-12-01")).toBe(true);
  });

  it("曜日を変えても、同じ週には再登録できない", () => {
    // 月曜日付けで 11/16（月）に登録済み → 金曜に変えても 11/20（金）は同じ週。
    const weekly = {
      ...rule,
      frequency: "weekly" as const,
      dayOfMonth: undefined,
      dayOfWeek: 5,
      registeredForDates: ["2026-11-16"],
    };
    expect(isRuleDue(weekly, "2026-11-20")).toBe(false);
    // 翌週の発生日（11/27）は別期間なので due になる。
    expect(isRuleDue(weekly, "2026-11-28")).toBe(true);
  });
});
