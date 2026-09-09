import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptItemRow } from "./ReceiptItemRow";

describe("ReceiptItemRow", () => {
  it("shows resolved item with normalized amount and tax rate", () => {
    render(
      <ReceiptItemRow
        item={{
          id: "1",
          itemName: "超熟",
          amountYen: "214",
          categoryId: "cat",
          normalizedAmountYen: 214,
          taxResolutionStatus: "resolved",
          taxAllocationStatus: "allocated",
          taxResolutionSource: "single_summary",
          taxRatePercent: 8,
          amountBasis: "tax_excluded",
        }}
      />,
    );

    expect(screen.getByText("超熟")).toBeInTheDocument();
    expect(screen.getByText("214円")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows unresolved warning without treating null as 0%", () => {
    render(
      <ReceiptItemRow
        item={{
          id: "1",
          itemName: "商品A",
          amountYen: "300",
          categoryId: "cat",
          taxResolutionStatus: "unresolved",
          taxRatePercent: null,
          amountBasis: "unknown",
        }}
      />,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.getByText("税率を判定できませんでした")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});
