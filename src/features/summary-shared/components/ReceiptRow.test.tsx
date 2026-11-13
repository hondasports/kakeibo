import { screen, waitFor } from "@testing-library/react";
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
  it("実行環境の数値ロケールに依存せず円表示する", () => {
    const original = Number.prototype.toLocaleString;
    const locale = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
      this: number,
    ) {
      return original.call(this, "de-DE");
    });
    try {
      renderWithProviders(<ReceiptRow receipt={sampleReceipt} />);
      expect(screen.getByText("1,280円")).toBeInTheDocument();
    } finally {
      locale.mockRestore();
    }
  });
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

  it("明細の長い品名は全文を参照できる", () => {
    const itemName = "牛乳、パン、卵、ヨーグルト、野菜、果物、その他の長い品名";
    renderWithProviders(<ReceiptRow isDetail receipt={{ ...sampleReceipt, itemName }} />);
    expect(screen.getByTitle(itemName)).toHaveTextContent(itemName);
  });

  it("2行を超える品名はキーボードで展開・折りたたみできる", async () => {
    const user = userEvent.setup();
    const itemName = "牛乳\nパン\n卵";
    renderWithProviders(<ReceiptRow isDetail receipt={{ ...sampleReceipt, itemName }} />);
    const toggle = screen.getByRole("button", { name: "もっと見る" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("item-expandable-content")).toHaveTextContent("卵");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("改行がなくても折り返しで3行になる品名を展開できる", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(60);
    const original = window.getComputedStyle;
    const style = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const result = original(element, pseudo);
      if (element.getAttribute("data-testid") === "item-expand-measure") {
        Object.defineProperty(result, "lineHeight", { value: "20px", configurable: true });
      }
      return result;
    });
    try {
      renderWithProviders(
        <ReceiptRow
          isDetail
          receipt={{ ...sampleReceipt, itemName: "折り返しが必要な長い品名" }}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
          "aria-expanded",
          "false",
        ),
      );
      await userEvent.setup().click(screen.getByRole("button", { name: "もっと見る" }));
      expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    } finally {
      height.mockRestore();
      style.mockRestore();
    }
  });

  it("2行以内の品名に展開ボタンを出さない", () => {
    renderWithProviders(
      <ReceiptRow isDetail receipt={{ ...sampleReceipt, itemName: "牛乳\nパン" }} />,
    );
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("短いメモは全文を表示する", () => {
    renderWithProviders(<ReceiptRow receipt={{ ...sampleReceipt, memo: "夕食の買い物" }} />);

    const nameCell = screen.getByText("食費").closest('[role="cell"]');
    expect(nameCell).toContainElement(screen.getByTestId("memo-expandable-content"));
    expect(
      screen
        .getByText("食費")
        .compareDocumentPosition(screen.getByTestId("memo-expandable-content")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("memo-expandable-content")).toHaveTextContent("メモ: 夕食の買い物");
    expect(screen.getByTestId("memo-expand-measure")).toHaveTextContent("メモ: 夕食の買い物");
    expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("改行3行以上のメモはトグルで展開すると全文が見える", async () => {
    const user = userEvent.setup();
    const multiLineMemo = ["あ", "い", "う", "え", "お"].join("\n");

    renderWithProviders(<ReceiptRow receipt={{ ...sampleReceipt, memo: multiLineMemo }} />);

    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("メモ: あ\nい");
    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("お");
    expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "もっと見る" }));

    expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");
  });

  it("支出にメモがない場合はラベルやプレースホルダーを表示しない", () => {
    renderWithProviders(<ReceiptRow receipt={sampleReceipt} />);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByText("メモ:")).not.toBeInTheDocument();
    expect(screen.queryByTestId("memo-expandable-content")).not.toBeInTheDocument();
  });
});
