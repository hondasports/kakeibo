import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { resolveEntryDefaultDate, useExpenseEntryMode } from "./useExpenseEntryMode";

const categories = [
  { _id: "cat-food" as Id<"categories">, name: "食費", color: "#AAB7C4" },
  { _id: "cat-daily" as Id<"categories">, name: "日用品", color: "#A6B28B" },
];

function renderMode(weekStartDate: string) {
  return renderHook(
    ({ weekStartDate: ws }) => useExpenseEntryMode({ weekStartDate: ws, categories }),
    { initialProps: { weekStartDate } },
  );
}

describe("resolveEntryDefaultDate", () => {
  it("表示週に今日が含まれれば今日を返す", () => {
    expect(resolveEntryDefaultDate("2026-11-16", "2026-11-18")).toBe("2026-11-18");
  });

  it("週の初日・末日が今日でも今日を返す", () => {
    expect(resolveEntryDefaultDate("2026-11-16", "2026-11-16")).toBe("2026-11-16");
    expect(resolveEntryDefaultDate("2026-11-16", "2026-11-22")).toBe("2026-11-22");
  });

  it("今日が週より前・後なら週初日を返す", () => {
    expect(resolveEntryDefaultDate("2026-11-16", "2026-11-15")).toBe("2026-11-16");
    expect(resolveEntryDefaultDate("2026-11-16", "2026-11-23")).toBe("2026-11-16");
  });
});

describe("useExpenseEntryMode 日付の初期値", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("表示週に今日（JST）が含まれるとき、日付の初期値は今日になる", () => {
    // JST 2026-11-18（水）12:00。週は 11/16(月)〜11/22(日)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T03:00:00Z"));

    const { result } = renderMode("2026-11-16");

    expect(result.current.date).toBe("2026-11-18");
  });

  it("表示週に今日が含まれないとき、日付の初期値は週初日になる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T03:00:00Z"));

    const { result } = renderMode("2026-11-09");

    expect(result.current.date).toBe("2026-11-09");
  });

  it("JSTの今日で判定する（UTCの日付ではなくJSTの日付を使う）", () => {
    // UTC 2026-11-22 15:30 = JST 2026-11-23 00:30。JSTの今日は週(11/16〜11/22)の翌日
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));

    const { result } = renderMode("2026-11-16");

    expect(result.current.date).toBe("2026-11-16");
  });

  it("週を移動すると日付が同じ規則でリセットされ、戻ると今日基準に戻る", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T03:00:00Z"));

    const { result, rerender } = renderMode("2026-11-16");
    expect(result.current.date).toBe("2026-11-18");

    act(() => result.current.setDate("2026-11-20"));
    expect(result.current.date).toBe("2026-11-20");

    // 前の週へ移動: 今日を含まないので週初日にリセット
    rerender({ weekStartDate: "2026-11-09" });
    expect(result.current.date).toBe("2026-11-09");

    // 今週へ戻る: 今日が含まれるので今日にリセット
    rerender({ weekStartDate: "2026-11-16" });
    expect(result.current.date).toBe("2026-11-18");
  });

  it("保存後のリセットで日付は引き継がれる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T03:00:00Z"));

    const { result } = renderMode("2026-11-16");
    act(() => result.current.setDate("2026-11-20"));
    act(() => result.current.resetAfterSave());

    expect(result.current.date).toBe("2026-11-20");
  });
});

describe("useExpenseEntryMode カテゴリの引き継ぎ", () => {
  it("初期値はカテゴリ一覧の先頭になる", () => {
    const { result } = renderMode("2026-11-16");
    expect(result.current.items[0]?.categoryId).toBe("cat-food");
  });

  it("保存後のリセットで前回選択したカテゴリを引き継ぐ", () => {
    const { result } = renderMode("2026-11-16");
    act(() => result.current.handleItemChange(0, "categoryId", "cat-daily"));
    act(() => result.current.resetAfterSave());

    expect(result.current.items[0]?.categoryId).toBe("cat-daily");
  });

  it("引き継ぐカテゴリが一覧に無いときは先頭カテゴリへフォールバックする", () => {
    const { result } = renderMode("2026-11-16");
    act(() => result.current.handleItemChange(0, "categoryId", "cat-deleted"));
    act(() => result.current.resetAfterSave());

    expect(result.current.items[0]?.categoryId).toBe("cat-food");
  });

  it("複数項目モードで保存したあとのリセットでも先頭項目のカテゴリを引き継ぐ", () => {
    const { result } = renderMode("2026-11-16");
    act(() => {
      result.current.setShopName("スーパー北浜");
      result.current.setSourceAmount("5000");
    });
    act(() => result.current.handleEnterMultiMode());
    expect(result.current.isMultiMode).toBe(true);

    act(() => result.current.handleItemChange(0, "categoryId", "cat-daily"));
    act(() => result.current.resetAfterSave());

    expect(result.current.isMultiMode).toBe(false);
    expect(result.current.items[0]?.categoryId).toBe("cat-daily");
  });

  it("カテゴリが後からロードされたとき、未選択の先頭項目には先頭カテゴリが入る", () => {
    const { result, rerender } = renderHook(
      ({ cats }) => useExpenseEntryMode({ weekStartDate: "2026-11-16", categories: cats }),
      { initialProps: { cats: [] as typeof categories } },
    );
    expect(result.current.items[0]?.categoryId).toBe("");

    rerender({ cats: categories });
    expect(result.current.items[0]?.categoryId).toBe("cat-food");
  });
});
