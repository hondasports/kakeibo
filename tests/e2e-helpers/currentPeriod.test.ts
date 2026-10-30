import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addWeeks,
  getCurrentMonth,
  getCurrentWeekStartDate,
} from "../../e2e/helpers/currentPeriod";
import { getCurrentWeekStartDate as getAppCurrentWeekStartDate } from "../../src/features/week/lib/weekNavigation";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

// JST月曜0:30にあたる瞬間（UTCでは日曜15:30、LAでは日曜08:30）
const JST_MONDAY_EARLY_MORNING = "2026-10-25T15:30:00Z";

describe("getCurrentWeekStartDate", () => {
  it.each(
    ["UTC", "Asia/Tokyo", "America/Los_Angeles"].flatMap((tz) =>
      [
        ["2026-10-25T14:59:59Z", "2026-10-19"],
        ["2026-10-25T15:00:00Z", "2026-10-26"],
        ["2023-12-31T14:59:59Z", "2023-12-25"],
        ["2023-12-31T15:00:00Z", "2024-01-01"],
        ["2026-05-31T15:00:00Z", "2026-06-01"],
      ].map(([instant, expected]) => [tz, instant, expected]),
    ),
  )("TZ=%s の固定時刻 %s で JST 週開始日をアプリと共有する", (tz, instant, expected) => {
    process.env.TZ = tz;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    expect(getCurrentWeekStartDate()).toBe(expected);
    expect(getAppCurrentWeekStartDate(1)).toBe(expected);
  });

  it("月曜の瞬間はその日自身を週開始日にする", () => {
    process.env.TZ = "UTC";
    expect(getCurrentWeekStartDate(new Date("2026-10-26T12:00:00Z"))).toBe("2026-10-26");
  });

  it("水曜の瞬間は直前の月曜を週開始日にする", () => {
    process.env.TZ = "UTC";
    expect(getCurrentWeekStartDate(new Date("2026-10-28T12:00:00Z"))).toBe("2026-10-26");
  });

  it("now はエポックミリ秒でも受け取れる", () => {
    process.env.TZ = "UTC";
    expect(getCurrentWeekStartDate(Date.parse("2026-10-28T12:00:00Z"))).toBe("2026-10-26");
  });
});

describe("getCurrentMonth", () => {
  it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])(
    "TZ=%s でも JST の暦月を返す（UTC 10/31 15:30 = JST 11/1 0:30 は 2026-11）",
    (tz) => {
      process.env.TZ = tz;
      expect(getCurrentMonth(new Date("2026-10-31T15:30:00Z"))).toBe("2026-11");
    },
  );

  it.each(["UTC", "Asia/Tokyo"])("TZ=%s でも同日が別月になる瞬間で JST 側の月を返す", (tz) => {
    process.env.TZ = tz;
    // JST では 2026-10-26 0:30（10月）、UTC では 2026-10-25 15:30（10月）→ 両者とも 2026-10
    expect(getCurrentMonth(new Date(JST_MONDAY_EARLY_MORNING))).toBe("2026-10");
  });
});

describe("addWeeks", () => {
  it.each(["UTC", "Asia/Tokyo", "America/Los_Angeles"])(
    "TZ=%s でも週開始日を7日単位で移動する",
    (tz) => {
      process.env.TZ = tz;
      expect(addWeeks("2026-10-19", -1)).toBe("2026-10-12");
      expect(addWeeks("2026-10-19", 1)).toBe("2026-10-26");
    },
  );

  it("月をまたぐ週移動も計算できる", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(addWeeks("2026-11-02", -1)).toBe("2026-10-26");
  });
});
