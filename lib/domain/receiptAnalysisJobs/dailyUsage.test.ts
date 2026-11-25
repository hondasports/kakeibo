import { describe, expect, it } from "vitest";
import { getTodayDateStringInJapan } from "../common/date";
import {
  isReceiptAnalysisDailyLimitReached,
  RECEIPT_ANALYSIS_DAILY_LIMIT,
  resolveEffectiveDailyUsageCount,
} from "./dailyUsage";

describe("resolveEffectiveDailyUsageCount", () => {
  it("record が無ければ 0", () => {
    expect(resolveEffectiveDailyUsageCount(null, "2026-11-26")).toBe(0);
  });
  it("当日の record は count を返す", () => {
    expect(
      resolveEffectiveDailyUsageCount({ jstDate: "2026-11-26", count: 42 }, "2026-11-26"),
    ).toBe(42);
  });
  it("前日の record は 0 にリセットされる", () => {
    expect(
      resolveEffectiveDailyUsageCount({ jstDate: "2026-11-25", count: 100 }, "2026-11-26"),
    ).toBe(0);
  });
});

describe("isReceiptAnalysisDailyLimitReached", () => {
  it("99 は未到達、100 は到達", () => {
    expect(isReceiptAnalysisDailyLimitReached(RECEIPT_ANALYSIS_DAILY_LIMIT - 1)).toBe(false);
    expect(isReceiptAnalysisDailyLimitReached(RECEIPT_ANALYSIS_DAILY_LIMIT)).toBe(true);
  });
});

describe("getTodayDateStringInJapan の境界", () => {
  it("UTC 15:00 は日本時間の翌日になる", () => {
    // 2026-11-25 15:00:00 UTC = 2026-11-26 00:00:00 JST
    expect(getTodayDateStringInJapan(Date.UTC(2026, 10, 25, 15, 0, 0))).toBe("2026-11-26");
  });
  it("UTC 14:59 は日本時間では当日23:59で同じ日", () => {
    expect(getTodayDateStringInJapan(Date.UTC(2026, 10, 25, 14, 59, 59))).toBe("2026-11-25");
  });
});
