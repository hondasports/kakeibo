import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewItemTaxDetails } from "./ReviewItemTaxDetails";

describe("ReviewItemTaxDetails", () => {
  it("印字額・金額基準・税率・按分税・数量単価を表示する", () => {
    render(
      <ReviewItemTaxDetails
        item={{
          id: "item-1",
          itemName: "たまご",
          amountYen: "322",
          categoryId: "cat-food",
          printedAmountYen: 298,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          allocatedTaxYen: 24,
          quantity: 2,
          unitPriceYen: 149,
        }}
      />,
    );

    expect(screen.getByText("印字額 298円")).toBeInTheDocument();
    expect(screen.getByText("税抜")).toBeInTheDocument();
    expect(screen.getByText("税率 8%")).toBeInTheDocument();
    expect(screen.getByText("按分税 24円")).toBeInTheDocument();
    expect(screen.getByText("2点 × 149円")).toBeInTheDocument();
  });

  it("登録額と同じ印字額・不明基準・0円税・1点表記は省略する", () => {
    render(
      <ReviewItemTaxDetails
        item={{
          id: "item-1",
          itemName: "日用品",
          amountYen: "1100",
          categoryId: "cat-daily",
          printedAmountYen: 1100,
          amountBasis: "unknown",
          taxRatePercent: 10,
          allocatedTaxYen: 0,
          quantity: 1,
          unitPriceYen: 1100,
        }}
      />,
    );

    expect(screen.queryByText("印字額 1,100円")).not.toBeInTheDocument();
    expect(screen.queryByText("税込・税抜不明")).not.toBeInTheDocument();
    expect(screen.queryByText("按分税 0円")).not.toBeInTheDocument();
    expect(screen.queryByText("1点 × 1,100円")).not.toBeInTheDocument();
    expect(screen.getByText("税率 10%")).toBeInTheDocument();
  });
});
