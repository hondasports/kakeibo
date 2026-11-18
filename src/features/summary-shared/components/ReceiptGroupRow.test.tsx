import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReceiptGroupRow } from "./ReceiptGroupRow";

it("グループ合計も実行環境の数値ロケールに依存せず円表示する", () => {
  const original = Number.prototype.toLocaleString;
  const locale = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
  ) {
    return original.call(this, "de-DE");
  });
  try {
    render(
      <ReceiptGroupRow
        group={{ id: "group-1", date: "2026-08-26", shopName: "店舗", amountYen: 1234, items: [] }}
      />,
    );
    expect(screen.getByText("1,234円")).toBeInTheDocument();
  } finally {
    locale.mockRestore();
  }
});

it("dateFormatを指定するとグループ見出しの日付に年を出し、指定しないときは「月/日」のまま", () => {
  const group = { id: "group-1", date: "2023-06-01", shopName: "店舗", amountYen: 1234, items: [] };
  const { container, unmount } = render(
    <ReceiptGroupRow dateFormat="yearMonthDay" group={group} />,
  );
  expect(container.querySelector(".receipt-row-date")).toHaveTextContent("2023/6/1");
  unmount();

  const plain = render(<ReceiptGroupRow group={group} />);
  expect(plain.container.querySelector(".receipt-row-date")).toHaveTextContent(/^6\/1$/);
});
