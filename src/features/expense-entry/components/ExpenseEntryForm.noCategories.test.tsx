import "./ExpenseEntryFormTestMocks";
import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ExpenseEntryForm } from "./ExpenseEntryForm";
import { createIncomeEntryMock } from "./ExpenseEntryFormTestMocks";

describe("ExpenseEntryForm（カテゴリ0件）", () => {
  it("支出タブを無効化し収入タブを既定表示にする", () => {
    renderWithProviders(
      <ExpenseEntryForm categories={[]} weekEndDate="2026-06-08" weekStartDate="2026-06-02" />,
    );

    expect(screen.getByRole("tab", { name: "支出" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "収入" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "収入" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("金額")).toBeInTheDocument();
    expect(screen.getByLabelText("収入の内容・メモ")).toBeInTheDocument();
    expect(screen.queryByLabelText("店舗名 / 支払先")).not.toBeInTheDocument();
  });

  it("カテゴリ0件でも収入を保存できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpenseEntryForm categories={[]} weekEndDate="2026-06-08" weekStartDate="2026-06-02" />,
    );

    await user.type(screen.getByLabelText("金額"), "50000");
    await user.type(screen.getByLabelText("収入の内容・メモ"), "給与");
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    await waitFor(() =>
      expect(createIncomeEntryMock).toHaveBeenCalledWith({
        date: "2026-06-02",
        amountYen: 50000,
        title: "給与",
      }),
    );
  });
});
