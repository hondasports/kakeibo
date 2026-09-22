import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptItemTaxDetail } from "./ReceiptItemTaxDetail";

describe("ReceiptItemTaxDetail", () => {
  it("レシートの金額と税率・判定理由を表示する", () => {
    render(
      <ReceiptItemTaxDetail
        draft={{
          markerDefinitions: [{ marker: "*", description: "軽減税率8%対象" }],
        }}
        item={{
          id: "1",
          itemName: "超熟",
          amountYen: "214",
          categoryId: "cat",
          printedAmountYen: 198,
          normalizedAmountYen: 214,
          allocatedTaxYen: 16,
          markers: ["*"],
          taxResolutionStatus: "resolved",
          taxResolutionSource: "summary_reconciliation",
          taxRatePercent: 8,
          amountBasis: "tax_excluded",
        }}
      />,
    );

    expect(screen.getByText("金額 198円")).toBeInTheDocument();
    expect(screen.getByText("記号 *")).toBeInTheDocument();
    expect(screen.getByText("軽減税率8%対象")).toBeInTheDocument();
    expect(screen.getByText("税率 8%")).toBeInTheDocument();
    expect(screen.getByText("レシート小計との照合で判定しました")).toBeInTheDocument();
    expect(screen.queryByText("按分税")).not.toBeInTheDocument();
    expect(screen.queryByText("登録金額")).not.toBeInTheDocument();
  });
});
