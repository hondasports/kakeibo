import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReceiptTaxSummaryReadOnly } from "./ReceiptTaxSummaryReadOnly";

describe("ReceiptTaxSummaryReadOnly", () => {
  it("unknown basisを税抜と誤表示しない", () => {
    render(
      <ReceiptTaxSummaryReadOnly
        summary={{
          taxRatePercent: 8,
          taxMode: "mixed",
          taxableAmountYen: 397,
          taxableAmountBasis: "unknown",
          taxYen: 29,
          warnings: [],
        }}
      />,
    );
    expect(screen.getByText("8% 混在")).toBeInTheDocument();
    expect(screen.getByText(/種別不明/)).toBeInTheDocument();
    expect(screen.queryByText(/税抜/)).not.toBeInTheDocument();
  });
});
