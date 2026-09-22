import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewItemsReadOnly } from "./ReviewItemsReadOnly";

describe("ReviewItemsReadOnly", () => {
  const reviewItem = {
    id: "item-1",
    itemName: "たまご",
    amountYen: "322",
    categoryId: "cat-food",
    printedAmountYen: 298,
    normalizedAmountYen: 322,
    amountBasis: "tax_excluded" as const,
    taxRatePercent: 8 as const,
    taxResolutionStatus: "resolved" as const,
    taxResolutionSource: "single_summary" as const,
    taxAllocationStatus: "allocated" as const,
    allocatedTaxYen: 24,
    warnings: ["税額を確認してください"],
  };

  it("登録額と税率を一覧表示する", () => {
    render(
      <ReviewItemsReadOnly
        categories={[{ _id: "cat-food", name: "食費", color: "#000000" }]}
        draft={null}
        reviewItems={[reviewItem]}
      />,
    );

    expect(screen.getByText("322円")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByText("カテゴリ: 食費")).toBeInTheDocument();
    expect(screen.getByText("税額を確認してください")).toBeInTheDocument();
  });

  it("詳細展開時にレシートの金額を表示する", () => {
    render(
      <ReviewItemsReadOnly
        categories={[{ _id: "cat-food", name: "食費", color: "#000000" }]}
        draft={null}
        expandedItemId="item-1"
        reviewItems={[reviewItem]}
      />,
    );

    expect(screen.getByText("金額 298円")).toBeInTheDocument();
    expect(screen.queryByText("按分税 24円")).not.toBeInTheDocument();
  });
});
