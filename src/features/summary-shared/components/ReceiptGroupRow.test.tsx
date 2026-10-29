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
