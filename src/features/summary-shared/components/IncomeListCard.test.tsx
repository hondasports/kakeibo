import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { IncomeItem } from "../types/types";
import { IncomeListCard } from "./IncomeListCard";

const incomes: IncomeItem[] = Array.from({ length: 7 }, (_, index) => ({
  _id: `income-${index}`,
  date: `2026-06-${String(21 - index).padStart(2, "0")}`,
  type: "income",
  bankName: `収入${index + 1}`,
  amountYen: 10_000 + index,
  recordType: "expenseEntry",
}));

describe("IncomeListCard", () => {
  it("初期表示を5件に制限し残件数を示して全件展開する", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncomeListCard count={7} isLoading={false} incomes={incomes} />);

    expect(screen.getByText("収入一覧（7件）")).toBeInTheDocument();
    expect(screen.getAllByTestId("receipt-row")).toHaveLength(5);
    const showMore = screen.getByRole("button", { name: "さらに2件を見る" });
    await user.click(showMore);

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(7);
  });

  it("収入は従来どおりメモ列と空メモを表示する", () => {
    renderWithProviders(
      <IncomeListCard count={1} isLoading={false} incomes={incomes.slice(0, 1)} />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "メモ" })).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("receipt-row")).getAllByRole("cell")).toHaveLength(5);
  });

  it("収入のメモは従来の独立したセルに表示する", () => {
    renderWithProviders(
      <IncomeListCard
        count={1}
        isLoading={false}
        incomes={[{ ...incomes[0], memo: "入金メモ" }]}
      />,
    );
    const row = screen.getByTestId("receipt-row");
    expect(within(row).getAllByRole("cell")[3]).toHaveTextContent("入金メモ");
    expect(within(row).queryByText("メモ:")).not.toBeInTheDocument();
  });

  it("収入がないとき空状態を表示する", () => {
    renderWithProviders(<IncomeListCard count={0} isLoading={false} incomes={[]} />);

    expect(screen.getByText("まだ収入がありません")).toBeInTheDocument();
    expect(screen.queryByText("カテゴリ")).not.toBeInTheDocument();
  });
});
