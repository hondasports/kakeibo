import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { getDateSpendingEntries, getMonthAggregationEntries, getYearAggregationEntries, MAX_YEAR_RANGE_ENTRIES, getMonthIncomeEntries, getMonthSpendingEntries, getWeekIncomeEntries, getWeekSpendingEntries } from "./spendingEntries";
import { makeExpenseEntry, makeReceipt, makeSourceDocument, makeAiExpenseDraft, makeAiExpenseDraftItem, createQueryCtx, groupId } from "./testHelpers";

describe("getWeekIncomeEntries", () => {
  it("expenseEntries に収入があれば receipt は無視する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e1" as Id<"expenseEntries">,
          entryType: "income",
          title: "給与",
          amount: 100000,
        }),
      ],
      receipts: [
        makeReceipt({
          _id: "r1" as Id<"receipts">,
          type: "income",
          bankName: "銀行",
          amountYen: 1,
        }),
      ],
    });

    const result = await getWeekIncomeEntries(ctx, groupId, "2024-01-08");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("e1");
    expect(result[0].amountYen).toBe(100000);
  });

  it("expenseEntries があり支出のみなら空配列を返す", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e1" as Id<"expenseEntries">, entryType: "expense" }),
      ],
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, type: "income" })],
    });

    const result = await getWeekIncomeEntries(ctx, groupId, "2024-01-08");
    expect(result).toEqual([]);
  });

  it("expenseEntries が空なら receipt の収入を返す", async () => {
    const ctx = createQueryCtx({
      receipts: [
        makeReceipt({
          _id: "r1" as Id<"receipts">,
          type: "income",
          bankName: "銀行",
          amountYen: 5000,
        }),
      ],
    });

    const result = await getWeekIncomeEntries(ctx, groupId, "2024-01-08");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r1");
  });

  it("expenseEntries も receipts も空なら空配列", async () => {
    const ctx = createQueryCtx();
    const result = await getWeekIncomeEntries(ctx, groupId, "2024-01-08");
    expect(result).toEqual([]);
  });
});

describe("getWeekSpendingEntries", () => {
  it("expenseEntries に支出があれば receipt は無視する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e1" as Id<"expenseEntries">,
          entryType: "expense",
          title: "スーパー",
          amount: 1500,
        }),
      ],
      receipts: [
        makeReceipt({
          _id: "r1" as Id<"receipts">,
          type: "expense",
          shopName: "コンビニ",
          amountYen: 1,
        }),
      ],
    });

    const result = await getWeekSpendingEntries(ctx, groupId, "2024-01-08");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("e1");
  });

  it("expenseEntries が空なら receipt の支出を返す", async () => {
    const ctx = createQueryCtx({
      receipts: [
        makeReceipt({
          _id: "r1" as Id<"receipts">,
          type: "expense",
          shopName: "コンビニ",
          amountYen: 500,
        }),
      ],
    });

    const result = await getWeekSpendingEntries(ctx, groupId, "2024-01-08");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r1");
  });

  it("sourceDocument が同じ支出をレシートグループとして返す", async () => {
    const sourceDocumentId = "source-1" as Id<"sourceDocuments">;
    const result = await getWeekSpendingEntries(
      createQueryCtx({
        expenseEntries: [
          makeExpenseEntry({
            _id: "e-food" as Id<"expenseEntries">,
            sourceDocumentId,
            title: "食料品",
            amount: 2000,
          }),
          makeExpenseEntry({
            _id: "e-daily" as Id<"expenseEntries">,
            sourceDocumentId,
            title: "洗剤",
            amount: 1000,
          }),
        ],
        sourceDocuments: [makeSourceDocument({ _id: sourceDocumentId })],
      }),
      groupId,
      "2024-01-08",
    );

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.receiptGroupId)).toEqual([
      "sourceDocument:source-1",
      "sourceDocument:source-1",
    ]);
    expect(result.map((entry) => entry.itemName)).toEqual(["食料品", "洗剤"]);
    expect(result[0]).toMatchObject({
      receiptShopName: "スーパー北浜",
      receiptTotalAmountYen: 3000,
    });
  });

  it("AI下書きの明細名を履歴用の商品名として返す", async () => {
    const draftId = "draft-1" as Id<"aiExpenseDrafts">;
    const result = await getWeekSpendingEntries(
      createQueryCtx({
        expenseEntries: [
          makeExpenseEntry({
            _id: "e-bread" as Id<"expenseEntries">,
            aiExpenseDraftId: draftId,
            title: "ジャパン 明石稲美店",
            amount: 1200,
          }),
        ],
        aiExpenseDrafts: [makeAiExpenseDraft({ _id: draftId })],
        aiExpenseDraftItems: [
          makeAiExpenseDraftItem({
            _id: "draft-item-1" as Id<"aiExpenseDraftItems">,
            draftId,
          }),
        ],
      }),
      groupId,
      "2024-01-08",
    );

    expect(result[0]).toMatchObject({
      itemName: "たっぷりホイップあんぱん",
      receiptShopName: "スーパー北浜",
    });
  });
});

describe("getDateSpendingEntries", () => {
  it("expenseEntries あり支出はそちらを優先", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e1" as Id<"expenseEntries">, entryType: "expense" }),
      ],
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, type: "expense" })],
    });

    const result = await getDateSpendingEntries(ctx, groupId, "2024-01-10");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("e1");
  });

  it("expenseEntries 空なら receipt の支出を返す", async () => {
    const ctx = createQueryCtx({
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, type: "expense" })],
    });

    const result = await getDateSpendingEntries(ctx, groupId, "2024-01-10");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r1");
  });
});

describe("getMonthSpendingEntries", () => {
  it("expenseEntries あり支出はそちらを優先", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e1" as Id<"expenseEntries">, entryType: "expense" }),
      ],
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, type: "expense" })],
    });

    const result = await getMonthSpendingEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("e1");
  });

  it("月の終了日を含む範囲で receipt を返す", async () => {
    const ctx = createQueryCtx({
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, date: "2024-01-31", type: "expense" })],
    });

    const result = await getMonthSpendingEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r1");
  });

  it("収入だけの expenseEntries がある月は旧 receipt の支出を補完する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e-income" as Id<"expenseEntries">, entryType: "income" }),
      ],
      receipts: [makeReceipt({ _id: "r1" as Id<"receipts">, type: "expense" })],
    });

    const result = await getMonthSpendingEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r1");
  });
});

describe("getMonthIncomeEntries", () => {
  it("expenseEntries がある月は expenseEntries の収入だけを返す", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e-income" as Id<"expenseEntries">, entryType: "income" }),
        makeExpenseEntry({ _id: "e-expense" as Id<"expenseEntries">, entryType: "expense" }),
      ],
      receipts: [makeReceipt({ _id: "r-income" as Id<"receipts">, type: "income" })],
    });

    const result = await getMonthIncomeEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("e-income");
  });

  it("expenseEntries が空なら旧 receipt の収入を返す", async () => {
    const ctx = createQueryCtx({
      receipts: [makeReceipt({ _id: "r-income" as Id<"receipts">, type: "income" })],
    });

    const result = await getMonthIncomeEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r-income");
  });

  it("新形式が支出だけの月は旧 receipt の収入を補完する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({ _id: "e-expense" as Id<"expenseEntries">, entryType: "expense" }),
      ],
      receipts: [makeReceipt({ _id: "r-income" as Id<"receipts">, type: "income" })],
    });

    const result = await getMonthIncomeEntries(ctx, groupId, "2024-01-01");
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("r-income");
  });
});

describe("getMonthAggregationEntries", () => {
  it("支出と収入を1回の取得で集計用に返す", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-expense" as Id<"expenseEntries">,
          amount: 1200,
          entryType: "expense",
        }),
        makeExpenseEntry({
          _id: "e-income" as Id<"expenseEntries">,
          amount: 50000,
          entryType: "income",
        }),
      ],
    });

    const result = await getMonthAggregationEntries(ctx, groupId, "2024-01-01");
    expect(result.expenses).toEqual([{ amountYen: 1200, categoryId: "cat-1" }]);
    expect(result.incomes).toEqual([{ amountYen: 50000 }]);
  });

  it("種別ごとに旧 receipt を補完する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-expense" as Id<"expenseEntries">,
          amount: 800,
          entryType: "expense",
        }),
      ],
      receipts: [
        makeReceipt({ _id: "r-income" as Id<"receipts">, amountYen: 20000, type: "income" }),
      ],
    });

    const result = await getMonthAggregationEntries(ctx, groupId, "2024-01-01");
    expect(result.expenses).toEqual([{ amountYen: 800, categoryId: "cat-1" }]);
    expect(result.incomes).toEqual([{ amountYen: 20000 }]);
  });

  it("カテゴリ未設定の支出は集計を拒否する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-no-category" as Id<"expenseEntries">,
          amount: 500,
          entryType: "expense",
          categoryId: undefined,
        }),
      ],
    });

    await expect(getMonthAggregationEntries(ctx, groupId, "2024-01-01")).rejects.toThrow(
      "Expense entry category is required for spending aggregation",
    );
  });
});

describe("getYearAggregationEntries", () => {
  it("1回の取得で月ごとの収支を分けて返す", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-jan" as Id<"expenseEntries">,
          date: "2024-01-10",
          amount: 1200,
          entryType: "expense",
        }),
        makeExpenseEntry({
          _id: "e-aug" as Id<"expenseEntries">,
          date: "2024-08-15",
          amount: 8000,
          entryType: "expense",
          categoryId: "cat-2" as Id<"categories">,
        }),
        makeExpenseEntry({
          _id: "e-aug-income" as Id<"expenseEntries">,
          date: "2024-08-25",
          amount: 200000,
          entryType: "income",
        }),
      ],
    });

    const result = await getYearAggregationEntries(ctx, groupId, "2024");
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({
      month: "2024-01",
      expenses: [{ amountYen: 1200, categoryId: "cat-1" }],
      incomes: [],
    });
    expect(result[7]).toEqual({
      month: "2024-08",
      expenses: [{ amountYen: 8000, categoryId: "cat-2" }],
      incomes: [{ amountYen: 200000 }],
    });
    expect(result[1]).toEqual({ month: "2024-02", expenses: [], incomes: [] });
  });

  it("月ごとに旧 receipt を補完する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: [
        makeExpenseEntry({
          _id: "e-jan" as Id<"expenseEntries">,
          date: "2024-01-10",
          amount: 800,
          entryType: "expense",
        }),
      ],
      receipts: [
        makeReceipt({
          _id: "r-feb-income" as Id<"receipts">,
          date: "2024-02-05",
          amountYen: 20000,
          type: "income",
        }),
        makeReceipt({
          _id: "r-jan-income" as Id<"receipts">,
          date: "2024-01-20",
          amountYen: 15000,
          type: "income",
        }),
      ],
    });

    const result = await getYearAggregationEntries(ctx, groupId, "2024");
    expect(result[0]).toEqual({
      month: "2024-01",
      expenses: [{ amountYen: 800, categoryId: "cat-1" }],
      incomes: [{ amountYen: 15000 }],
    });
    expect(result[1]).toEqual({
      month: "2024-02",
      expenses: [],
      incomes: [{ amountYen: 20000 }],
    });
  });

  it("年次の件数上限を超えたら拒否する", async () => {
    const ctx = createQueryCtx({
      expenseEntries: Array.from({ length: MAX_YEAR_RANGE_ENTRIES + 1 }, (_, index) =>
        makeExpenseEntry({
          _id: `e-${index}` as Id<"expenseEntries">,
          date: "2024-01-01",
        }),
      ),
    });

    await expect(getYearAggregationEntries(ctx, groupId, "2024")).rejects.toThrow(
      "Too many expense entries for this date range",
    );
  });
});
