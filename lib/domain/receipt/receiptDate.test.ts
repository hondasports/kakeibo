import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlausibleReceiptYear, normalizeReceiptDate } from "./receiptDate";

describe("normalizeReceiptDate", () => {
  it.each([
    ["2024-03-15", "2024-03-15"],
    ["2024/3/15", "2024-03-15"],
    ["2024年3月15日", "2024-03-15"],
    ["1999-12-31", "1999-12-31"],
    ["26年07月24日", "2026-07-24"],
    ["  2024-03-15  ", "2024-03-15"],
    ["2024-03-15\u3000", "2024-03-15"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeReceiptDate(input)).toEqual({ success: true, date: expected });
  });

  it.each(["2024-02-30", "2024-13-01", "abc"])("%s は無効な日付", (input) => {
    const result = normalizeReceiptDate(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(["invalid", "no_candidate", "ambiguous", "range_expression"]).toContain(result.error);
    }
  });

  it("OCRが作った不合理な未来年を拒否する", () => {
    expect(normalizeReceiptDate("2674年07月24日")).toEqual({ success: false, error: "invalid" });
  });

  it("範囲表現を拒否する", () => {
    const result = normalizeReceiptDate("2024-03-15〜2024-03-20");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("range_expression");
    }
  });

  it("候補が曖昧なら拒否する", () => {
    const result = normalizeReceiptDate("2024-03-15, 2024-03-16");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("ambiguous");
    }
  });

  it("空文字は無効", () => {
    const result = normalizeReceiptDate("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("no_candidate");
    }
  });
});

describe("JST基準の日付境界", () => {
  afterEach(() => vi.useRealTimers());
  it("JSTの年越しで翌年の許可境界が切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T14:59:59Z"));
    expect(isPlausibleReceiptYear(2028)).toBe(false);
    vi.setSystemTime(new Date("2026-12-31T15:00:00Z"));
    expect(isPlausibleReceiptYear(2028)).toBe(true);
    expect(isPlausibleReceiptYear(2029)).toBe(false);
    expect(normalizeReceiptDate("2028-02-29")).toEqual({ success: true, date: "2028-02-29" });
  });
  it.each(["2011-12-30", "0100-01-01", "2000-02-29"])("%s は実行環境によらず受理する", (date) => {
    expect(normalizeReceiptDate(date)).toEqual({ success: true, date });
  });
  it.each(["0000-01-01", "0001-01-01", "0099-01-01", "1900-02-29", "2024-04-31"])(
    "%s の既存拒否契約を保つ",
    (date) => {
      expect(normalizeReceiptDate(date)).toEqual({ success: false, error: "invalid" });
    },
  );
});
