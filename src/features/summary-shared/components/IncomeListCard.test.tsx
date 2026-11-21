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
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    await user.click(showMore);

    expect(screen.getAllByTestId("receipt-row")).toHaveLength(7);
    const collapse = screen.getByRole("button", { name: "閉じる" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    await user.click(collapse);
    expect(screen.getAllByTestId("receipt-row")).toHaveLength(5);
  });

  it("dateFormatを指定すると収入一覧の日付に年を出す", () => {
    renderWithProviders(
      <IncomeListCard
        count={1}
        dateFormat="yearMonthDay"
        incomes={incomes.slice(0, 1)}
        isLoading={false}
      />,
    );
    expect(screen.getByTestId("receipt-row").querySelector(".receipt-row-date")).toHaveTextContent(
      "2026/6/21",
    );
    expect(screen.getByRole("table")).toHaveClass("receipt-list--with-year");
  });

  it("dateFormatを指定しない収入一覧には年つき列幅のクラスを付けない", () => {
    renderWithProviders(
      <IncomeListCard count={1} incomes={incomes.slice(0, 1)} isLoading={false} />,
    );
    expect(screen.getByRole("table")).not.toHaveClass("receipt-list--with-year");
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

  it("編集・削除を渡さないときは「操作」の見出しと列を出さない", () => {
    renderWithProviders(
      <IncomeListCard count={1} isLoading={false} incomes={incomes.slice(0, 1)} />,
    );
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["日付", "内容", "金額（円）", "メモ"]);
    for (const row of within(table).getAllByRole("row").slice(1)) {
      const cells = within(row)
        .getAllByRole("cell", { hidden: true })
        .filter((cell) => !cell.classList.contains("receipt-row-actions"));
      expect(cells).toHaveLength(headers.length);
    }
  });

  it("編集・削除を渡すときは「操作」の見出しと列を出す", () => {
    renderWithProviders(
      <IncomeListCard
        count={1}
        isLoading={false}
        incomes={incomes.slice(0, 1)}
        onDeleteIncome={() => {}}
        onEditIncome={() => {}}
      />,
    );
    const table = screen.getByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["日付", "内容", "金額（円）", "メモ", "操作"]);
    for (const row of within(table).getAllByRole("row").slice(1)) {
      expect(within(row).getAllByRole("cell", { hidden: true })).toHaveLength(headers.length);
    }
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
