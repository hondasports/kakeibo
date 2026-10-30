import { afterEach, describe, expect, it } from "vitest";
import {
  calculateWeekEndDate,
  calculateWeekStartDate,
  calculateRelativeWeekStartDate,
  DEFAULT_WEEK_START_DAY,
  getWeekEndDay,
  isValidIsoDateString,
  normalizeWeekStartDay,
  validateWeekDay,
} from "./weekDates";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])(
  "TZ=%s でも週末と前週を正しく計算する",
  (tz) => {
    process.env.TZ = tz;
    expect(calculateWeekEndDate("2024-01-08")).toBe("2024-01-14");
    expect(calculateRelativeWeekStartDate("2024-01-08", -1)).toBe("2024-01-01");
  },
);

describe("DEFAULT_WEEK_START_DAY", () => {
  it("月曜日（1）が既定値", () => {
    expect(DEFAULT_WEEK_START_DAY).toBe(1);
  });
});

describe("normalizeWeekStartDay", () => {
  it.each([1, 2, 3, 4, 5, 6, 0])("有効な曜日 %s をそのまま返す", (day) => {
    expect(normalizeWeekStartDay(day)).toBe(day);
  });

  it("範囲外または undefined の場合は既定値を返す", () => {
    expect(normalizeWeekStartDay(undefined)).toBe(DEFAULT_WEEK_START_DAY);
    expect(normalizeWeekStartDay(-1)).toBe(DEFAULT_WEEK_START_DAY);
    expect(normalizeWeekStartDay(7)).toBe(DEFAULT_WEEK_START_DAY);
    expect(normalizeWeekStartDay(1.5)).toBe(DEFAULT_WEEK_START_DAY);
  });
});

describe("validateWeekDay", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("有効な曜日 %s を受け入れる", (day) => {
    expect(validateWeekDay(day)).toEqual({ success: true, day });
  });

  it.each([-1, 7, 1.5, Number.NaN])("無効な曜日 %s を拒否する", (day) => {
    const result = validateWeekDay(day);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("invalid");
    }
  });
});

describe("getWeekEndDay", () => {
  it("月曜始まりの場合の週終了曜日は日曜日（0）", () => {
    expect(getWeekEndDay(DEFAULT_WEEK_START_DAY)).toBe(0);
  });

  it("水曜始まりの場合の週終了曜日は火曜日", () => {
    expect(getWeekEndDay(3)).toBe(2);
  });
});

describe("calculateWeekStartDate", () => {
  it("月曜日は自分自身を返す", () => {
    expect(calculateWeekStartDate("2024-01-08")).toBe("2024-01-08");
  });

  it("日曜日は前の月曜日を返す", () => {
    expect(calculateWeekStartDate("2024-01-14")).toBe("2024-01-08");
  });

  it("水曜日はその週の月曜日を返す", () => {
    expect(calculateWeekStartDate("2024-01-10")).toBe("2024-01-08");
  });

  it("土曜日はその週の月曜日を返す", () => {
    expect(calculateWeekStartDate("2024-01-13")).toBe("2024-01-08");
  });

  it("月をまたぐ日付でも正しく計算する", () => {
    expect(calculateWeekStartDate("2024-02-01")).toBe("2024-01-29");
  });

  it("指定した曜日を週の始まりとして計算する", () => {
    expect(calculateWeekStartDate("2024-01-10", 3)).toBe("2024-01-10");
    expect(calculateWeekStartDate("2024-01-14", 3)).toBe("2024-01-10");
  });
});

describe("calculateWeekEndDate", () => {
  it("月曜日から日曜日を正しく計算する", () => {
    expect(calculateWeekEndDate("2024-01-08")).toBe("2024-01-14");
  });

  it("月をまたぐ週終了日を正しく計算する", () => {
    expect(calculateWeekEndDate("2024-01-29")).toBe("2024-02-04");
  });
});

describe("calculateRelativeWeekStartDate", () => {
  it("前週の週開始日を返す", () => {
    expect(calculateRelativeWeekStartDate("2024-01-08", -1)).toBe("2024-01-01");
  });

  it("月をまたぐ次週の週開始日を返す", () => {
    expect(calculateRelativeWeekStartDate("2024-01-29", 1)).toBe("2024-02-05");
  });
});

describe("isValidIsoDateString", () => {
  it("実在する YYYY-MM-DD を受け入れる", () => {
    expect(isValidIsoDateString("2026-06-21")).toBe(true);
  });

  it("空文字や不正形式を拒否する", () => {
    expect(isValidIsoDateString("")).toBe(false);
    expect(isValidIsoDateString("2026/06/21")).toBe(false);
    expect(isValidIsoDateString("2026-02-30")).toBe(false);
  });
});

describe("週日付の年・月境界", () => {
  it("週開始・終了・相対移動を環境のタイムゾーンによらず計算する", () => {
    expect(calculateWeekStartDate("2024-01-01")).toBe("2024-01-01");
    expect(calculateWeekEndDate("2023-12-25")).toBe("2023-12-31");
    expect(calculateWeekEndDate("2024-01-29")).toBe("2024-02-04");
    expect(calculateRelativeWeekStartDate("2024-01-01", -1)).toBe("2023-12-25");
  });
});
