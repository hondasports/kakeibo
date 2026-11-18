import { describe, expect, it } from "vitest";
import {
  formatDateForDisplay,
  formatDateWithYearForDisplay,
  formatDateTimeForDisplay,
  formatJapaneseDate,
  formatShortDateWithWeekday,
} from "./date";

describe("formatDateForDisplay", () => {
  it("ISO形式の日付を M/D 形式にフォーマットする", () => {
    expect(formatDateForDisplay("2026-05-18")).toBe("5/18");
  });

  it("1月1日を正しくフォーマットする", () => {
    expect(formatDateForDisplay("2026-01-01")).toBe("1/1");
  });

  it("12月31日を正しくフォーマットする", () => {
    expect(formatDateForDisplay("2026-12-31")).toBe("12/31");
  });

  it("1桁の月・日でもゼロパディングなし", () => {
    expect(formatDateForDisplay("2026-03-05")).toBe("3/5");
  });
});

describe("formatDateWithYearForDisplay", () => {
  it("ISO形式の日付を YYYY/M/D 形式にフォーマットする", () => {
    expect(formatDateWithYearForDisplay("2023-06-01")).toBe("2023/6/1");
  });

  it("1月1日・12月31日の年の境界を正しくフォーマットする", () => {
    expect(formatDateWithYearForDisplay("2026-01-01")).toBe("2026/1/1");
    expect(formatDateWithYearForDisplay("2026-12-31")).toBe("2026/12/31");
  });

  it("1桁の月・日でもゼロパディングなし", () => {
    expect(formatDateWithYearForDisplay("2026-03-05")).toBe("2026/3/5");
  });
});

describe("formatDateTimeForDisplay", () => {
  it("Unix タイムスタンプを日本語の日時表記に変換する", () => {
    const timestamp = new Date(2026, 0, 15, 3, 30).getTime();
    const formatted = formatDateTimeForDisplay(timestamp);
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/3:30/);
  });
});

describe("formatShortDateWithWeekday", () => {
  it("曜日付きで日付をフォーマットする", () => {
    expect(formatShortDateWithWeekday("2026-05-18")).toBe("5/18（月）");
  });
});

describe("formatJapaneseDate", () => {
  it("年月日形式でフォーマットする", () => {
    expect(formatJapaneseDate("2026-07-09")).toBe("2026年7月9日");
  });
});
