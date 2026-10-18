import { describe, expect, it } from "vitest";
import {
  LINE_HELP_MESSAGE,
  LINE_NO_GROUP_MESSAGE,
  LINE_RECEIPT_GUIDE_MESSAGE,
  LINE_SUMMARY_UNAVAILABLE_MESSAGE,
  formatCategoryReply,
  formatNoDataReply,
  formatWeekCategoriesReply,
  formatWeekExpenseReply,
  formatWeekIncomeReply,
  formatWeekSummaryReply,
  formatWeekTrendReply,
} from "./reply";

const weekInput = {
  weekStartDate: "2026-08-10",
  expenseCount: 2,
  expenseTotalYen: 3000,
  incomeCount: 1,
  incomeTotalYen: 180000,
  byCategory: [
    {
      categoryId: "food",
      categoryName: "食費",
      categoryColor: "#f97316",
      totalAmountYen: 2000,
      count: 1,
    },
    {
      categoryId: "daily",
      categoryName: "日用品",
      categoryColor: "#0ea5e9",
      totalAmountYen: 1000,
      count: 1,
    },
  ],
};

describe("LINE summary reply formatting", () => {
  it.each([
    { name: "週サマリー", format: formatWeekSummaryReply },
    { name: "カテゴリ別", format: formatWeekCategoriesReply },
  ])("長い$name返信を省略記号込み5000文字に収める", ({ format }) => {
    const text = format({
      ...weekInput,
      byCategory: Array.from({ length: 200 }, (_, index) => ({
        ...weekInput.byCategory[0],
        categoryId: `category-${index}`,
        categoryName: "あ".repeat(30),
      })),
    });

    expect(text).toHaveLength(5000);
    expect(text.endsWith("…")).toBe(true);
  });

  it("データがある週サマリーは支出・収入・内訳を含む", () => {
    const text = formatWeekSummaryReply(weekInput);
    expect(text).toContain("2026-08-10〜2026-08-16");
    expect(text).toContain("支出: 3,000円");
    expect(text).toContain("収入: 180,000円");
    expect(text).toContain("・食費 2,000円");
    expect(text).toContain("・日用品 1,000円");
  });

  it("支出・収入が無い週サマリーは専用の空メッセージにする", () => {
    expect(
      formatWeekSummaryReply({
        ...weekInput,
        expenseCount: 0,
        expenseTotalYen: 0,
        incomeCount: 0,
        incomeTotalYen: 0,
        byCategory: [],
      }),
    ).toBe("今週（2026-08-10〜2026-08-16）の家計データはありません。");
  });

  it("支出・収入・カテゴリ別・カテゴリ名・推移の空データを破綻させない", () => {
    expect(formatWeekExpenseReply({ ...weekInput, expenseCount: 0, expenseTotalYen: 0 })).toBe(
      "今週（2026-08-10〜2026-08-16）の支出データはありません。",
    );
    expect(formatWeekIncomeReply({ ...weekInput, incomeCount: 0, incomeTotalYen: 0 })).toBe(
      "今週（2026-08-10〜2026-08-16）の収入データはありません。",
    );
    expect(formatWeekCategoriesReply({ ...weekInput, expenseCount: 0, byCategory: [] })).toBe(
      "今週（2026-08-10〜2026-08-16）のカテゴリ別支出データはありません。",
    );
    expect(formatCategoryReply(weekInput, "食費", undefined)).toBe(
      "今週の「食費」の支出データはありません。",
    );
    expect(
      formatWeekTrendReply({ weeks: [{ weekStartDate: "2026-08-10", totalAmountYen: 0 }] }),
    ).toBe("直近3週間の支出データはありません。");
    expect(formatNoDataReply("summary", "2026-08-10")).toContain("家計データはありません");
  });

  it("支出・収入・カテゴリ別・推移の個別返信を作る", () => {
    expect(formatWeekExpenseReply(weekInput)).toBe(
      "今週（2026-08-10〜2026-08-16）の支出: 3,000円（2件）",
    );
    expect(formatWeekIncomeReply(weekInput)).toBe(
      "今週（2026-08-10〜2026-08-16）の収入: 180,000円（1件）",
    );
    expect(formatWeekCategoriesReply(weekInput)).toContain("・食費 2,000円");
    expect(formatCategoryReply(weekInput, "食費", weekInput.byCategory[0])).toBe(
      "今週（2026-08-10〜2026-08-16）の食費: 2,000円（1件）",
    );
    expect(
      formatWeekTrendReply({
        weeks: [
          { weekStartDate: "2026-07-20", totalAmountYen: 100 },
          { weekStartDate: "2026-07-27", totalAmountYen: 200 },
          { weekStartDate: "2026-08-03", totalAmountYen: 300 },
          { weekStartDate: "2026-08-10", totalAmountYen: 400 },
        ],
      }),
    ).toBe(
      [
        "直近3週間の支出",
        "・2週前（2026-07-27〜2026-08-02） 200円",
        "・先週（2026-08-03〜2026-08-09） 300円",
        "・今週（2026-08-10〜2026-08-16） 400円",
      ].join("\n"),
    );
  });

  it("グループ未設定メッセージに家計金額を含めない", () => {
    expect(LINE_NO_GROUP_MESSAGE).not.toContain("円");
    expect(LINE_HELP_MESSAGE).not.toContain("円");
    expect(LINE_RECEIPT_GUIDE_MESSAGE).not.toContain("円");
    expect(LINE_RECEIPT_GUIDE_MESSAGE).toContain("レシート画像");
    expect(LINE_HELP_MESSAGE).toContain("レシート画像をこのトークに送る");
    expect(LINE_HELP_MESSAGE).toContain("Webの入力画面で確認する");
    expect(LINE_SUMMARY_UNAVAILABLE_MESSAGE).not.toContain("円");
    expect(LINE_SUMMARY_UNAVAILABLE_MESSAGE).not.toBe(LINE_HELP_MESSAGE);
    expect(LINE_SUMMARY_UNAVAILABLE_MESSAGE).not.toBe(LINE_NO_GROUP_MESSAGE);
  });
});
