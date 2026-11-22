import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import type { ReceiptItem } from "../types/types";
import { ExpenseBulkCategoryDialog } from "./ExpenseBulkCategoryDialog";

const selectedReceipts: ReceiptItem[] = [
  {
    _id: "e1",
    date: "2026-06-15",
    shopName: "店A",
    amountYen: 100,
    categoryId: "food",
    categoryName: "食費",
    categoryColor: "#f97316",
    recordType: "expenseEntry",
  },
  {
    _id: "e2",
    date: "2026-06-15",
    shopName: "店B",
    amountYen: 200,
    categoryId: "daily",
    categoryName: "日用品",
    categoryColor: "#22c55e",
    recordType: "expenseEntry",
  },
];

describe("ExpenseBulkCategoryDialog", () => {
  it("プレビュー文言と複数カテゴリの注意を出し、変更するまで確定しない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onPreviewCategory = vi.fn();

    renderWithProviders(
      <ExpenseBulkCategoryDialog
        categories={[
          { _id: "food", name: "食費" },
          { _id: "daily", name: "日用品" },
        ]}
        open
        saving={false}
        selectedReceipts={selectedReceipts}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onPreviewCategory={onPreviewCategory}
      />,
    );

    expect(screen.getByText(/明細2件を/)).toBeInTheDocument();
    expect(screen.getByText(/1つのカテゴリにまとまります/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更する" })).toBeDisabled();

    await user.click(screen.getByLabelText("変更後のカテゴリ"));
    await user.click(screen.getByRole("option", { name: "食費" }));
    expect(screen.getByText("明細2件を「食費」へ変更します。")).toBeInTheDocument();
    expect(onPreviewCategory).toHaveBeenCalledWith({ _id: "food", name: "食費" });

    await user.click(screen.getByRole("button", { name: "変更する" }));
    expect(onConfirm).toHaveBeenCalledWith("food");
  });
});
