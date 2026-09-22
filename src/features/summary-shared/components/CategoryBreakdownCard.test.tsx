import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CategoryBreakdownCard } from "./CategoryBreakdownCard";

const categories = [
  {
    categoryId: "food",
    categoryName: "食費",
    categoryColor: "#123456",
    totalAmountYen: 1200,
    count: 2,
  },
];

describe("CategoryBreakdownCard", () => {
  it("読み込み中はスケルトンを表示する", () => {
    renderWithProviders(
      <CategoryBreakdownCard byCategory={[]} count={0} isLoading totalAmountYen={0} />,
    );

    expect(document.querySelectorAll(".MuiSkeleton-root")).toHaveLength(3);
    expect(screen.queryByText("まだレシートがありません")).not.toBeInTheDocument();
  });

  it("入力がない場合は指定した空状態メッセージを表示する", () => {
    renderWithProviders(
      <CategoryBreakdownCard
        byCategory={[]}
        count={0}
        emptyMessage="この週の支出はありません"
        isLoading={false}
        showPercentage
        title="支出カテゴリ"
        totalAmountYen={0}
      />,
    );

    expect(screen.getByRole("heading", { name: "支出カテゴリ" })).toBeInTheDocument();
    expect(screen.getByText("この週の支出はありません")).toBeInTheDocument();
    expect(screen.getByText("金額 (円)")).toBeInTheDocument();
  });

  it("カテゴリ別の件数と金額を表示し、合計0円なら割合バーを表示しない", () => {
    renderWithProviders(
      <CategoryBreakdownCard
        byCategory={categories}
        count={1}
        isLoading={false}
        totalAmountYen={0}
      />,
    );

    expect(screen.getByText("食費")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "2件"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "1,200円"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("割合表示では金額・割合・プログレスバーを表示する", () => {
    renderWithProviders(
      <CategoryBreakdownCard
        byCategory={categories}
        count={2}
        isLoading={false}
        showPercentage
        totalAmountYen={2400}
      />,
    );

    expect(
      screen.getByText((_, element) => element?.getAttribute("data-value") === "1,200円"),
    ).toBeInTheDocument();
    expect(screen.getByText("(50%)")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "食費の割合" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(screen.queryByText("2件")).not.toBeInTheDocument();
  });
});
