import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReviewItemValues } from "../types/types";
import { ReceiptTotalsPanel } from "./ReceiptTotalsPanel";

function item(overrides: Partial<ReviewItemValues> = {}): ReviewItemValues {
  return {
    id: "item-1",
    itemName: "商品",
    amountYen: "100",
    categoryId: "category-1",
    taxResolutionStatus: "resolved",
    amountBasis: "tax_included",
    taxRatePercent: 10,
    taxResolutionSource: "single_summary",
    printedAmountYen: 100,
    normalizedAmountYen: 100,
    ...overrides,
  } as ReviewItemValues;
}

const taxSummary = {
  taxRatePercent: 10 as const,
  taxMode: "included" as const,
  taxableAmountYen: 100,
  taxableAmountBasis: "tax_included" as const,
  taxYen: 0,
  roundingMethod: "unknown" as const,
  warnings: [],
};

describe("ReceiptTotalsPanel", () => {
  it("一致時は金額一致の1行だけを表示する", () => {
    render(
      <ReceiptTotalsPanel paidTotalYen={100} reviewItems={[item()]} taxSummaries={[taxSummary]} />,
    );

    const panel = screen.getByLabelText("金額の照合");
    expect(panel).toHaveTextContent("金額一致");
    expect(panel).toHaveTextContent("100円");
    expect(screen.queryByText("登録合計（税込）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "内訳を表示" })).not.toBeInTheDocument();
  });

  it("不一致時は差額を表示し、展開時だけ詳細照合を表示する", () => {
    render(<ReceiptTotalsPanel paidTotalYen={220} reviewItems={[item()]} />);

    const panel = screen.getByLabelText("金額の照合");
    expect(panel).toHaveTextContent("金額差額");
    expect(panel).toHaveTextContent("120円");
    expect(screen.getByRole("button", { name: "内訳を表示" })).toBeInTheDocument();
    expect(screen.queryByText("登録合計（税込）")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "内訳を表示" }));

    expect(screen.getByText("登録合計（税込）")).toBeVisible();
    expect(screen.getByText("お支払い（レシート合計）")).toBeVisible();
    expect(screen.getByRole("button", { name: "内訳を閉じる" })).toBeInTheDocument();
  });

  it("レシート合計の手修正後に登録合計との差額を再計算する", () => {
    const reviewItems = [
      item({ amountYen: "743", printedAmountYen: 743, normalizedAmountYen: 743 }),
    ];
    const { rerender } = render(
      <ReceiptTotalsPanel paidTotalYen={803} reviewItems={reviewItems} />,
    );

    expect(screen.getByLabelText("金額の照合")).toHaveTextContent("60円");

    rerender(<ReceiptTotalsPanel paidTotalYen={7803} reviewItems={reviewItems} />);

    expect(screen.getByLabelText("金額の照合")).toHaveTextContent("7,060円");
  });
});
