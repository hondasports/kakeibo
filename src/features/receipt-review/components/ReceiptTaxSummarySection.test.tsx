import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaxSummaryConsistencyReason } from "../../../../lib/receiptTax/types";
import { ReceiptTaxSummarySection } from "./ReceiptTaxSummarySection";

function draft(
  overrides: {
    status?: "coherent" | "reconcilable" | "conflicting";
    reasons?: TaxSummaryConsistencyReason[];
  } = {},
) {
  return {
    _id: "draft-1",
    status: "needs_review" as const,
    documentType: "receipt" as const,
    reviewReasons: [],
    taxSummaries: [
      {
        taxRatePercent: 10 as const,
        taxMode: "included" as const,
        taxableAmountYen: 1060,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 96,
        roundingMethod: "floor" as const,
        warnings: [],
        ...overrides,
      },
    ],
  };
}

describe("ReceiptTaxSummarySection", () => {
  it("coherent サマリは読み取り専用で表示する", () => {
    render(<ReceiptTaxSummarySection draft={draft({ status: "coherent" })} />);

    expect(screen.getByLabelText("税率別集計")).toBeInTheDocument();
    expect(screen.getByText("10% 内税")).toBeInTheDocument();
    expect(screen.getByText("対象額 1,060円（税込）")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  });

  it("conflicting サマリは編集可能な表示になる", () => {
    render(
      <ReceiptTaxSummarySection
        draft={draft({ status: "conflicting", reasons: ["tax_summary_amount_mismatch"] })}
        onSummaryChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("税率別集計")).toBeInTheDocument();
    expect(screen.getByText("10% 内税")).toBeInTheDocument();
    expect(
      screen.getByText("税率別対象額・税額・支払合計の金額が一致しません"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "対象額" })).toBeInTheDocument();
  });

  it("taxSummaries が空なら何も描画しない", () => {
    const { container } = render(
      <ReceiptTaxSummarySection
        draft={{
          _id: "draft-1",
          status: "needs_review",
          documentType: "receipt",
          reviewReasons: [],
          taxSummaries: [],
        }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("修正対象が0件なら税率別集計の要素や余白を描画しない", () => {
    const { container } = render(
      <ReceiptTaxSummarySection draft={draft({ status: "coherent" })} editableSummaries={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("宣言だけ整合したサマリでも未配分の修正理由と確認ラベルを表示する", () => {
    render(
      <ReceiptTaxSummarySection
        draft={draft({ status: "coherent" })}
        editableSummaries={[
          {
            summaryIndex: 0,
            sourceIndex: 2,
            message: "10%の税内訳：税額を商品に配分できていません。",
          },
        ]}
      />,
    );
    expect(screen.getByText("確認が必要")).toBeVisible();
    expect(screen.queryByText("確認済み")).not.toBeInTheDocument();
    expect(screen.getByText("10%の税内訳：税額を商品に配分できていません。")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存" })).toBeVisible();
  });
});
