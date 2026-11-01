import { describe, expect, it, vi, afterEach } from "vitest";
import {
  addWeeks,
  generateWeekDays,
  getCurrentWeekStartDate,
  getWeekEndDay,
  getWeekEndDate,
  formatWeekPeriod,
  isFutureWeek,
  normalizeWeekStartDate,
} from "./weekNavigation";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("weekNavigation", () => {
  it("日付文字列を月曜始まりの週開始日に正規化する", () => {
    expect(normalizeWeekStartDate("2026-05-20")).toBe("2026-05-18");
    expect(normalizeWeekStartDate("2026-05-18")).toBe("2026-05-18");
    expect(normalizeWeekStartDate("2026-05-24")).toBe("2026-05-18");
  });

  it("指定した曜日を週の始まりとして正規化する", () => {
    expect(normalizeWeekStartDate("2026-05-20", 3)).toBe("2026-05-20");
    expect(normalizeWeekStartDate("2026-05-24", 3)).toBe("2026-05-20");
  });

  it("週の終わりは開始日の6日後の曜日になる", () => {
    expect(getWeekEndDay(1)).toBe(0);
    expect(getWeekEndDay(3)).toBe(2);
  });

  it("不正な日付文字列は null にする", () => {
    expect(normalizeWeekStartDate("not-a-date")).toBeNull();
    expect(normalizeWeekStartDate("2026-13-40")).toBeNull();
    expect(normalizeWeekStartDate("")).toBeNull();
  });

  it("週開始日から前後の週を7日単位で計算する", () => {
    expect(addWeeks("2026-05-18", -1)).toBe("2026-05-11");
    expect(addWeeks("2026-05-18", 1)).toBe("2026-05-25");
  });

  it("週開始日から週終了日を計算する", () => {
    expect(getWeekEndDate("2026-05-18")).toBe("2026-05-24");
  });

  it("今週より後の週だけ未来週として判定する", () => {
    expect(isFutureWeek("2026-05-25", "2026-05-18")).toBe(true);
    expect(isFutureWeek("2026-05-18", "2026-05-18")).toBe(false);
    expect(isFutureWeek("2026-05-11", "2026-05-18")).toBe(false);
  });
});

describe("generateWeekDays", () => {
  it("weekStartDate から weekEndDate までの7日分の日付リストを生成する", () => {
    const result = generateWeekDays("2026-05-18", "2026-05-24");
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ label: "月", date: "5/18", isoDate: "2026-05-18" });
    expect(result[6]).toEqual({ label: "日", date: "5/24", isoDate: "2026-05-24" });
  });

  it("曜日ラベルが正しい順序で並ぶ", () => {
    const result = generateWeekDays("2026-05-18", "2026-05-24");
    expect(result.map((d) => d.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
  });

  it("月をまたぐ週でも正しく生成される", () => {
    const result = generateWeekDays("2026-04-27", "2026-05-03");
    expect(result[0]).toEqual({ label: "月", date: "4/27", isoDate: "2026-04-27" });
    expect(result[6]).toEqual({ label: "日", date: "5/3", isoDate: "2026-05-03" });
  });
});

describe("formatWeekPeriod", () => {
  it("週の開始日と終了日を日本語形式にフォーマットする", () => {
    expect(formatWeekPeriod("2026-05-18", "2026-05-24")).toBe("2026年5月18日 - 5月24日");
  });

  it("月をまたぐ週でも正しくフォーマットされる", () => {
    expect(formatWeekPeriod("2026-04-27", "2026-05-03")).toBe("2026年4月27日 - 5月3日");
  });

  it("年をまたぐ週でも正しくフォーマットされる", () => {
    expect(formatWeekPeriod("2025-12-29", "2026-01-04")).toBe("2025年12月29日 - 1月4日");
  });
});

describe("getCurrentWeekStartDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(
    ["UTC", "Asia/Tokyo", "America/Los_Angeles"].flatMap((tz) => [
      [tz, "2026-10-18T14:59:59Z", "2026-10-12"],
      [tz, "2026-10-18T15:00:00Z", "2026-10-19"],
    ]),
  )("TZ=%s の %s で JST の週開始日を返す", (tz, instant, expected) => {
    process.env.TZ = tz;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    expect(getCurrentWeekStartDate()).toBe(expected);
  });

  it("月曜日のとき、その日が週開始日になる", () => {
    // 2026-05-18 は月曜日
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T03:00:00Z"));
    expect(getCurrentWeekStartDate()).toBe("2026-05-18");
  });

  it("水曜日のとき、直前の月曜日が週開始日になる", () => {
    // 2026-05-20 は水曜日
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T03:00:00Z"));
    expect(getCurrentWeekStartDate()).toBe("2026-05-18");
  });

  it("日曜日のとき、直前の月曜日が週開始日になる", () => {
    // 2026-05-24 は日曜日
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T03:00:00Z"));
    expect(getCurrentWeekStartDate()).toBe("2026-05-18");
  });

  it("週開始曜日を変更すると現在週も追従する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T03:00:00Z"));
    expect(getCurrentWeekStartDate(3)).toBe("2026-05-20");
  });
});
