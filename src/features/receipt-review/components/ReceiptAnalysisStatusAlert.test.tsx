import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toReceiptAnalysisViewModel } from "../utils/receiptItemTaxViewModel";
import { ReceiptAnalysisStatusAlert } from "./ReceiptAnalysisStatusAlert";

describe("ReceiptAnalysisStatusAlert", () => {
  it("shows needs_review message with unresolved count", () => {
    const analysis = toReceiptAnalysisViewModel({
      reviewItems: [
        {
          id: "1",
          itemName: "A",
          amountYen: "100",
          categoryId: "cat",
          taxResolutionStatus: "unresolved",
          taxRatePercent: null,
        },
        {
          id: "2",
          itemName: "B",
          amountYen: "200",
          categoryId: "cat",
          taxResolutionStatus: "resolved",
          taxResolutionSource: "single_summary",
          taxRatePercent: 8,
          amountBasis: "tax_included",
        },
      ],
      paidTotalYen: 300,
    });

    render(<ReceiptAnalysisStatusAlert analysis={analysis} />);

    expect(screen.getByText("分析結果を確認してください")).toBeInTheDocument();
    expect(screen.getByText("税率を判定できない明細が1件あります")).toBeInTheDocument();
  });

  it("shows which side is higher when normalized total differs from paid total", () => {
    const analysis = toReceiptAnalysisViewModel({
      reviewItems: [
        {
          id: "1",
          itemName: "A",
          amountYen: "100",
          categoryId: "cat",
          taxResolutionStatus: "resolved",
          taxResolutionSource: "single_summary",
          taxRatePercent: 8,
          amountBasis: "tax_included",
        },
      ],
      paidTotalYen: 150,
    });

    render(<ReceiptAnalysisStatusAlert analysis={analysis} />);

    expect(screen.getByText(/支払合計が50円多い/)).toBeInTheDocument();
  });
});
