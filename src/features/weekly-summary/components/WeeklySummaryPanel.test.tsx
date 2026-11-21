import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { WeeklySummaryPanel } from "./WeeklySummaryPanel";
import { buildWeeklyExpenseChartData } from "../utils/weeklyExpenseChartData";

describe("WeeklySummaryPanel", () => {
  it("レシート0件では空状態を表示し、予算情報は表示しない", () => {
    // Given: 今週のレシートがまだ登録されていない
    renderWithProviders(
      <WeeklySummaryPanel
        count={0}
        totalAmountYen={0}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[]}
        weekStartDate="2024-01-08"
        weeklyExpenseTrend={null}
      />,
    );

    // When: 週次サマリーを確認する
    // Then: 空状態が表示され、予算情報は表示されない
    expect(screen.getByLabelText("合計支出")).toHaveTextContent("0円");
    expect(screen.getByLabelText("合計収入")).toHaveTextContent("0円");
    expect(screen.queryByText("未設定")).not.toBeInTheDocument();
    expect(screen.queryByText("予算")).not.toBeInTheDocument();
    expect(screen.getAllByText("まだ支出がありません")).toHaveLength(2);
    expect(screen.getByText("まだ収入がありません")).toBeInTheDocument();
  });

  it("複数レシートの合計、カテゴリ別、前週比、支出一覧を表示する", async () => {
    // Given: カテゴリ別に集計済みのレシートがある
    renderWithProviders(
      <WeeklySummaryPanel
        count={2}
        totalAmountYen={6280}
        byCategory={[
          {
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#AAB7C4",
            totalAmountYen: 4280,
            count: 1,
          },
          {
            categoryId: "cat-daily",
            categoryName: "日用品",
            categoryColor: "#A6B28B",
            totalAmountYen: 2000,
            count: 1,
          },
        ]}
        prevWeekTotalAmountYen={7000}
        receipts={[
          {
            _id: "receipt-1",
            date: "2026-05-18",
            shopName: "スーパー北浜",
            itemName: "食料品",
            amountYen: 4280,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#AAB7C4",
            recordType: "receipt",
          },
          {
            _id: "receipt-2",
            date: "2026-05-19",
            shopName: "ドラッグストア南",
            itemName: "洗剤",
            amountYen: 2000,
            categoryId: "cat-daily",
            categoryName: "日用品",
            categoryColor: "#A6B28B",
            recordType: "receipt",
          },
        ]}
        weekStartDate="2026-05-13"
        weeklyExpenseTrend={null}
      />,
    );

    // When: 週次サマリーを確認する
    // Then: 合計・カテゴリ別・支出一覧が表示され、予算情報は表示されない
    // 合計支出ラベルとアニメーションコンテナの存在を確認
    expect(screen.getByText("合計支出")).toBeInTheDocument();
    expect(screen.getAllByText("6,280円").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/10,000円 中 63% 消化/)).not.toBeInTheDocument();
    expect(screen.queryByText(/中 63% 消化/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("予算消化率")).not.toBeInTheDocument();
    expect(screen.getByText("−720円")).toBeInTheDocument();
    expect(screen.getByText("比較データなし")).toBeInTheDocument();
    expect(screen.getByText("スーパー北浜")).toBeInTheDocument();
    expect(screen.getByText("ドラッグストア南")).toBeInTheDocument();
    expect(screen.getAllByText("食費")).toHaveLength(2);
    expect(screen.getAllByText("日用品")).toHaveLength(2);
  });

  it("weeklyExpenseTrendがデータを含むときグラフが表示される", () => {
    const weeklyExpenseTrend = buildWeeklyExpenseChartData({
      currentWeekStartDate: "2024-01-08",
      targetWeekStartDate: "2024-01-08",
      weeks: [
        { weekStartDate: "2023-12-25", totalAmountYen: 1_000, byCategory: [] },
        { weekStartDate: "2024-01-01", totalAmountYen: 2_000, byCategory: [] },
        { weekStartDate: "2024-01-08", totalAmountYen: 3_000, byCategory: [] },
      ],
    });
    renderWithProviders(
      <WeeklySummaryPanel
        count={0}
        totalAmountYen={0}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[]}
        weekStartDate="2024-01-08"
        weeklyExpenseTrend={weeklyExpenseTrend}
      />,
    );

    // When: 週次サマリーを確認する
    // Then: 週別支出推移グラフが表示される
    expect(screen.getByRole("img", { name: "週別支出推移グラフ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "週別支出推移" })).toBeInTheDocument();
  });

  it("weeklyExpenseTrendが空のときプレースホルダーが表示される", () => {
    renderWithProviders(
      <WeeklySummaryPanel
        count={0}
        totalAmountYen={0}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[]}
        weekStartDate="2024-01-08"
        weeklyExpenseTrend={buildWeeklyExpenseChartData({
          currentWeekStartDate: "2024-01-08",
          targetWeekStartDate: "2024-01-08",
          weeks: [
            { weekStartDate: "2023-12-25", totalAmountYen: 0, byCategory: [] },
            { weekStartDate: "2024-01-01", totalAmountYen: 0, byCategory: [] },
            { weekStartDate: "2024-01-08", totalAmountYen: 0, byCategory: [] },
          ],
        })}
      />,
    );

    expect(screen.getByText("週別の支出データがあると表示されます")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "週別支出推移グラフ" })).not.toBeInTheDocument();
  });

  it("weeklyExpenseTrendがnullのときグラフセクションを表示しない", () => {
    renderWithProviders(
      <WeeklySummaryPanel
        count={0}
        totalAmountYen={0}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[]}
        weekStartDate="2024-01-08"
        weeklyExpenseTrend={null}
      />,
    );

    expect(screen.queryByRole("heading", { name: "週別支出推移" })).not.toBeInTheDocument();
  });

  it("weeklyExpenseTrendがundefinedのときSkeletonつきでグラフセクションを表示する", () => {
    renderWithProviders(
      <WeeklySummaryPanel
        count={0}
        totalAmountYen={0}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[]}
        weekStartDate="2024-01-08"
        weeklyExpenseTrend={undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "週別支出推移" })).toBeInTheDocument();
    expect(screen.getByTestId("weekly-summary-metrics-loading")).toBeInTheDocument();
    expect(screen.queryByText("比較データなし")).not.toBeInTheDocument();
  });

  it("支出と収入の種別が判別できる", () => {
    renderWithProviders(
      <WeeklySummaryPanel
        count={1}
        totalAmountYen={4280}
        totalIncomeYen={300000}
        incomeCount={1}
        byCategory={[]}
        prevWeekTotalAmountYen={null}
        receipts={[
          {
            _id: "expense-1",
            date: "2026-05-18",
            type: "expense",
            shopName: "スーパー北浜",
            itemName: "食料品",
            amountYen: 4280,
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#AAB7C4",
            recordType: "expenseEntry",
          },
        ]}
        incomes={[
          {
            _id: "income-1",
            date: "2026-05-18",
            type: "income",
            bankName: "三菱UFJ銀行",
            amountYen: 300000,
            recordType: "expenseEntry",
          },
        ]}
        weekStartDate="2026-05-13"
        weeklyExpenseTrend={null}
      />,
    );

    expect(screen.getByText("支出")).toBeInTheDocument();
    expect(screen.getByText("収入")).toBeInTheDocument();
    expect(screen.getByLabelText("合計収入")).toHaveTextContent("300,000円");
    expect(screen.getByText("収入一覧（1件）")).toBeInTheDocument();
  });

  // 振り返りメモとセッション完了UIは Issue #309 で削除済み。
});
