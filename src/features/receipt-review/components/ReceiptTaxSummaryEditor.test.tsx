import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaxSummaryConsistencyReason } from "../../../../lib/receiptTax/types";
import { ReceiptTaxSummaryEditor } from "./ReceiptTaxSummaryEditor";

function summary(
  overrides: {
    status?: "coherent" | "reconcilable" | "conflicting";
    reasons?: TaxSummaryConsistencyReason[];
  } = {},
) {
  return {
    taxRatePercent: 10 as const,
    taxMode: "included" as const,
    taxableAmountYen: 960,
    taxableAmountBasis: "tax_excluded" as const,
    taxYen: 96,
    taxIncludedAmountYen: 1060,
    roundingMethod: "floor" as const,
    warnings: [],
    ...overrides,
  };
}

describe("ReceiptTaxSummaryEditor", () => {
  it("conflicting 状態の summary を編集して保存すると変更内容が通知される", async () => {
    const onChange = vi.fn();
    render(
      <ReceiptTaxSummaryEditor
        isSaving={false}
        summary={summary({
          status: "conflicting",
          reasons: ["included_mode_with_tax_excluded_basis"],
        })}
        summaryIndex={0}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("10% 内税")).toBeInTheDocument();
    expect(
      screen.getByText("内税として読み取りましたが、対象額は税抜として読み取られています"),
    ).toBeInTheDocument();

    const user = userEvent.setup();

    const taxableAmountInput = screen.getByRole("spinbutton", { name: "対象額" });
    await user.clear(taxableAmountInput);
    await user.type(taxableAmountInput, "1060");

    const basisSelect = screen.getByRole("combobox", { name: "対象額種別" });
    await user.click(basisSelect);
    await user.click(screen.getByRole("option", { name: "税込印字" }));

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onChange).toHaveBeenCalledWith(0, {
      taxableAmountYen: 1060,
      taxableAmountBasis: "tax_included",
    });
  });

  it("変更がない場合は保存しない", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReceiptTaxSummaryEditor
        isSaving={false}
        summary={summary()}
        summaryIndex={0}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("保存中は入力が無効化される", () => {
    render(
      <ReceiptTaxSummaryEditor
        isSaving
        summary={summary({ status: "conflicting" })}
        summaryIndex={0}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "対象額" })).toBeDisabled();
  });

  it("混在を選択でき、unknown basisを税抜と誤表示しない", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReceiptTaxSummaryEditor
        isSaving={false}
        summary={{ ...summary(), taxableAmountBasis: "unknown" }}
        summaryIndex={0}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/種別不明/)).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "税モード" }));
    await user.click(screen.getByRole("option", { name: "混在" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onChange).toHaveBeenCalledWith(0, { taxMode: "mixed" });
  });
});
