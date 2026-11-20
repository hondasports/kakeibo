import { describe, expect, it } from "vitest";
import { addDays, getMonthEndDate, getTodayDateStringInJapan, isValidCalendarDate } from "./date";

describe("addDays", () => {
  it("通常の日加算", () => {
    expect(addDays("2024-01-10", 1)).toBe("2024-01-11");
    expect(addDays("2024-01-10", 5)).toBe("2024-01-15");
  });

  it("月またぎ", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
    expect(addDays("2024-04-30", 1)).toBe("2024-05-01");
  });

  it("年末年始", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });

  it("うるう年の2月", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  });

  it("0日加算は変更なし", () => {
    expect(addDays("2024-06-15", 0)).toBe("2024-06-15");
  });

  it("負の日数", () => {
    expect(addDays("2024-01-10", -1)).toBe("2024-01-09");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2024-01-01", -1)).toBe("2023-12-31");
  });

  it("週の終了日（6日加算）", () => {
    expect(addDays("2024-01-08", 6)).toBe("2024-01-14");
  });

  it("西半球のタイムゾーンでも週末日を正しく返す", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";

    try {
      expect(addDays("2024-01-08", 6)).toBe("2024-01-14");
    } finally {
      if (previousTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimeZone;
      }
    }
  });

  it("不正な日付は NaN 形式を返す（防御的ではないことの確認）", () => {
    expect(addDays("not-a-date", 1)).toMatch(/NaN-NaN-NaN/);
  });
});

describe("getMonthEndDate", () => {
  it("通常月", () => {
    expect(getMonthEndDate("2024-01-01")).toBe("2024-01-31");
    expect(getMonthEndDate("2024-04-01")).toBe("2024-04-30");
  });

  it("うるう年の2月", () => {
    expect(getMonthEndDate("2024-02-01")).toBe("2024-02-29");
  });

  it("非うるう年の2月", () => {
    expect(getMonthEndDate("2023-02-01")).toBe("2023-02-28");
  });

  it("12月", () => {
    expect(getMonthEndDate("2024-12-01")).toBe("2024-12-31");
  });

  it("月の開始日でなくても、その月の月末を返す", () => {
    expect(getMonthEndDate("2024-03-15")).toBe("2024-03-31");
    expect(getMonthEndDate("2024-02-30")).toBe("2024-02-29");
  });

  it("年跨ぎ", () => {
    expect(getMonthEndDate("2024-12-15")).toBe("2024-12-31");
    expect(getMonthEndDate("2025-01-01")).toBe("2025-01-31");
  });

  it("不正なフォーマットは NaN を含む", () => {
    expect(getMonthEndDate("not-a-date")).toMatch(/NaN/);
  });
});

describe("isValidCalendarDate", () => {
  it("暦に存在する日付を受け付ける", () => {
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
    expect(isValidCalendarDate(2026, 11, 20)).toBe(true);
  });

  it("暦に存在しない日付を拒否する", () => {
    expect(isValidCalendarDate(2023, 2, 29)).toBe(false);
    expect(isValidCalendarDate(2024, 13, 1)).toBe(false);
  });

  it("小数の日・月・年は暦日として扱わない", () => {
    expect(isValidCalendarDate(2024, 2, 1.5)).toBe(false);
    expect(isValidCalendarDate(2024, 1.5, 15)).toBe(false);
  });

  it("100年未満の年を1900年代へ補正しない", () => {
    expect(isValidCalendarDate(99, 1, 1)).toBe(false);
  });
});

describe("getTodayDateStringInJapan", () => {
  it("固定時刻を日本日付に変換する", () => {
    const result = getTodayDateStringInJapan(new Date("2026-08-08T00:00:00+09:00"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-08-08");
  });

  it("number を受け入れる", () => {
    const result = getTodayDateStringInJapan(new Date("2026-08-08T00:00:00+09:00").getTime());
    expect(result).toBe("2026-08-08");
  });

  it("UTC 深夜でも日本日付を返す", () => {
    const result = getTodayDateStringInJapan(new Date("2026-08-07T15:00:00Z"));
    expect(result).toBe("2026-08-08");
  });
});
