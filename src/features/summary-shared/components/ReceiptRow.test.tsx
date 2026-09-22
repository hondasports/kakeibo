import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ReceiptRow } from "./ReceiptRow";
import type { ReceiptItem } from "../types/types";

const sampleReceipt: ReceiptItem = {
  _id: "entry-001",
  date: "2026-06-21",
  type: "expense",
  shopName: "スーパーA",
  amountYen: 1280,
  categoryId: "cat-food",
  categoryName: "食費",
  categoryColor: "#AAB7C4",
  recordType: "expenseEntry",
};

describe("ReceiptRow", () => {
  it("編集と削除ボタンからコールバックを呼び出す", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithProviders(<ReceiptRow receipt={sampleReceipt} onEdit={onEdit} onDelete={onDelete} />);

    expect(screen.getByTestId("receipt-row")).toHaveClass("receipt-row");
    expect(screen.getByRole("button", { name: "スーパーA（6/21）を編集" })).toHaveStyle({
      minHeight: "44px",
    });

    await user.click(screen.getByRole("button", { name: "スーパーA（6/21）を編集" }));
    await user.click(screen.getByRole("button", { name: "スーパーA（6/21）を削除" }));

    expect(onEdit).toHaveBeenCalledWith(sampleReceipt);
    expect(onDelete).toHaveBeenCalledWith(sampleReceipt);
  });

  it("短いメモは全文を表示する", () => {
    renderWithProviders(<ReceiptRow receipt={{ ...sampleReceipt, memo: "夕食の買い物" }} />);

    expect(screen.getByTestId("memo-expandable-content")).toHaveTextContent("夕食の買い物");
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("改行3行以上のメモはトグルで展開すると全文が見える", async () => {
    const user = userEvent.setup();
    const multiLineMemo = ["あ", "い", "う", "え", "お"].join("\n");

    renderWithProviders(<ReceiptRow receipt={{ ...sampleReceipt, memo: multiLineMemo }} />);

    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("あ");
    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("お");
    expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "もっと見る" }));

    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("メモがない場合はプレースホルダーを表示する", () => {
    renderWithProviders(<ReceiptRow receipt={sampleReceipt} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
    expect(screen.queryByText("メモあり")).not.toBeInTheDocument();
  });
});
