import { describe, expect, it } from "vitest";
import {
  filterEntriesByKind,
  filterReceiptsByKind,
  groupDocsByMonth,
  mapAggregationEntries,
  needsLegacyReceiptsForMonthAggregation,
  needsLegacyReceiptsForYearAggregation,
  resolveSpendingEntriesSource,
  resolveWeekIncomeSource,
  resolveYearRange,
} from "./legacyFallback";

const exp = (amount: number, categoryId?: string) => ({
  entryType: "expense" as const,
  amount,
  categoryId,
});
const inc = (amount: number) => ({ entryType: "income" as const, amount });

describe("filterEntriesByKind / filterReceiptsByKind", () => {
  it("receipts の type 未設定は支出扱い", () => {
    const receipts = [
      { type: undefined },
      { type: "income" as const },
      { type: "expense" as const },
    ];
    expect(filterReceiptsByKind(receipts, "expense")).toHaveLength(2);
    expect(filterReceiptsByKind(receipts, "income")).toHaveLength(1);
  });
  it("entries は entryType で分ける", () => {
    expect(filterEntriesByKind([exp(1), inc(2)], "income")).toEqual([inc(2)]);
  });
});

describe("resolveWeekIncomeSource", () => {
  it("収入あり→new、支出のみ→none、空→legacy", () => {
    expect(resolveWeekIncomeSource([exp(1), inc(2)])).toBe("new");
    expect(resolveWeekIncomeSource([exp(1)])).toBe("none");
    expect(resolveWeekIncomeSource([])).toBe("legacy");
  });
});

describe("needsLegacyReceiptsForMonthAggregation", () => {
  it("両種別が新形式にあるときだけ不要", () => {
    expect(needsLegacyReceiptsForMonthAggregation([exp(1), inc(1)])).toBe(false);
    expect(needsLegacyReceiptsForMonthAggregation([exp(1)])).toBe(true);
    expect(needsLegacyReceiptsForMonthAggregation([inc(1)])).toBe(true);
    expect(needsLegacyReceiptsForMonthAggregation([])).toBe(true);
  });
});

describe("needsLegacyReceiptsForYearAggregation", () => {
  it("いずれかの月で欠けがあれば必要", () => {
    const full = new Map([
      ["2024-01", [exp(1), inc(1)]],
      ["2024-02", [exp(1), inc(1)]],
    ]);
    expect(needsLegacyReceiptsForYearAggregation(["2024-01", "2024-02"], full)).toBe(false);
    expect(needsLegacyReceiptsForYearAggregation(["2024-01", "2024-03"], full)).toBe(true);
  });
});

describe("mapAggregationEntries", () => {
  const receipts = [
    { type: "expense" as const, amountYen: 10, categoryId: "r1" },
    { type: undefined, amountYen: 20, categoryId: "r2" },
    { type: "income" as const, amountYen: 30, categoryId: "r3" },
  ];

  it("新形式があれば種別ごとにそれを使う", () => {
    expect(mapAggregationEntries([exp(100, "c1"), inc(200)], receipts)).toEqual({
      success: true,
      expenses: [{ amountYen: 100, categoryId: "c1" }],
      incomes: [{ amountYen: 200 }],
    });
  });

  it("支出だけ旧形式へフォールバックする（種別独立）", () => {
    expect(mapAggregationEntries([inc(200)], receipts)).toEqual({
      success: true,
      expenses: [
        { amountYen: 10, categoryId: "r1" },
        { amountYen: 20, categoryId: "r2" },
      ],
      incomes: [{ amountYen: 200 }],
    });
  });

  it("収入だけ旧形式へフォールバックする", () => {
    expect(mapAggregationEntries([exp(100, "c1")], receipts)).toEqual({
      success: true,
      expenses: [{ amountYen: 100, categoryId: "c1" }],
      incomes: [{ amountYen: 30 }],
    });
  });

  it("支出エントリの categoryId 欠落はエラー", () => {
    expect(mapAggregationEntries([exp(100)], receipts)).toEqual({
      success: false,
      error: "expense_category_required",
    });
  });
});

describe("groupDocsByMonth", () => {
  it("範囲外を除外し YYYY-MM でまとめる", () => {
    const grouped = groupDocsByMonth(
      [
        { date: "2024-01-05" },
        { date: "2024-01-20" },
        { date: "2024-02-01" },
        { date: "2023-12-31" },
      ],
      "2024-01-01",
      "2024-12-31",
    );
    expect([...grouped.keys()]).toEqual(["2024-01", "2024-02"]);
    expect(grouped.get("2024-01")).toHaveLength(2);
  });
});

describe("resolveYearRange", () => {
  it("12ヶ月と初日〜末日を返す", () => {
    const r = resolveYearRange("2024");
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.months).toHaveLength(12);
    expect(r.startDate).toBe("2024-01-01");
    expect(r.endDate).toBe("2024-12-31");
  });
});

describe("resolveSpendingEntriesSource", () => {
  it("新形式の支出があれば new、収入のみ・空なら legacy", () => {
    expect(resolveSpendingEntriesSource([{ entryType: "expense" }])).toBe("new");
    expect(resolveSpendingEntriesSource([{ entryType: "income" }])).toBe("legacy");
    expect(resolveSpendingEntriesSource([{ entryType: "income" }, { entryType: "expense" }])).toBe(
      "new",
    );
    expect(resolveSpendingEntriesSource([])).toBe("legacy");
  });
});
