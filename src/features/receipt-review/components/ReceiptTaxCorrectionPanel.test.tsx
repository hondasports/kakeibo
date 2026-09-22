import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";
import { ReceiptTaxCorrectionPanel } from "./ReceiptTaxCorrectionPanel";

const draft: AiExpenseDraft = {
  _id: "draft-1",
  status: "needs_review",
  documentType: "receipt",
  reviewReasons: ["amount_mismatch"],
  receiptTaxDecision: {
    priceTaxTreatment: "unknown",
    taxRateComposition: "unknown",
    resolutionStatus: "ambiguous",
    resolutionSource: "ai",
    evidence: [],
    reasons: [],
    candidates: [],
    taxAmount: { roundingMethod: "unknown", source: "unknown" },
  },
};

const form: ReviewFormValues = {
  documentType: "receipt",
  shopName: "店",
  date: "2026-08-27",
  amountYen: "1100",
  categoryId: "cat-1",
  registrationMode: "detailed",
};

const items: ReviewItemValues[] = [
  {
    id: "item-1",
    itemName: "商品",
    amountYen: "1000",
    categoryId: "cat-1",
    normalizedAmountYen: 1000,
    allocatedTaxYen: 0,
  },
];

describe("ReceiptTaxCorrectionPanel", () => {
  it("要確認時に2段階選択と保存予定額を表示する", () => {
    render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={vi.fn()}
        onOpenItemEditing={vi.fn()}
        reviewForm={form}
        reviewItems={items}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "1. 商品の表示価格はどれですか" })).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "2. 税率はどれですか" })).toBeVisible();
    expect(screen.getByText(/レシート合計：1,100円/)).toBeVisible();
    expect(screen.getByText(/差額：100円/)).toBeVisible();
    expect(screen.getByText(/保存予定：小計1,000円/)).toBeVisible();
    expect(screen.getByText(/「レシート合計だけ保存」を選ぶ場合：1,100円/)).toBeVisible();
  });

  it("ユーザーが税区分と税率を明示した場合は推定表示を付けない", () => {
    render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={vi.fn()}
        onOpenItemEditing={vi.fn()}
        reviewForm={{
          ...form,
          priceTaxTreatment: "excluded",
          taxRateComposition: "rate10",
        }}
        reviewItems={items}
      />,
    );

    expect(screen.getByText(/保存予定：/)).not.toHaveTextContent("推定を含む");
  });

  it("税額ソースが推定の場合だけ推定表示を付ける", () => {
    render(
      <ReceiptTaxCorrectionPanel
        draft={{
          ...draft,
          receiptTaxDecision: {
            ...draft.receiptTaxDecision!,
            taxAmount: { roundingMethod: "round", source: "estimated" },
          },
        }}
        onFieldChange={vi.fn()}
        onOpenItemEditing={vi.fn()}
        reviewForm={{
          ...form,
          priceTaxTreatment: "excluded",
          taxRateComposition: "rate10",
        }}
        reviewItems={items}
      />,
    );

    expect(screen.getByText(/保存予定：/)).toHaveTextContent("推定を含む");
  });

  it("分からないを選ぶとレシート合計だけの保存へ切り替える", () => {
    const onFieldChange = vi.fn();
    render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={vi.fn()}
        reviewForm={form}
        reviewItems={items}
      />,
    );

    fireEvent.click(screen.getAllByRole("radio", { name: "分からない" })[0]!);
    expect(onFieldChange).toHaveBeenCalledWith("priceTaxTreatment", "unknown");
    expect(onFieldChange).toHaveBeenCalledWith("registrationMode", "totalOnly");
  });

  it("レシート合計を直接修正でき、不明選択後は追加の税率入力を求めない", () => {
    const onFieldChange = vi.fn();
    const { rerender } = render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={vi.fn()}
        reviewForm={form}
        reviewItems={items}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "レシート合計" }), {
      target: { value: "1,200円" },
    });
    expect(onFieldChange).toHaveBeenCalledWith("amountYen", "1200");

    rerender(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={vi.fn()}
        reviewForm={{
          ...form,
          priceTaxTreatment: "unknown",
          taxRateComposition: "rate8",
          registrationMode: "totalOnly",
        }}
        reviewItems={items}
      />,
    );
    expect(
      screen.queryByRole("radiogroup", { name: "2. 税率はどれですか" }),
    ).not.toBeInTheDocument();
  });

  it("商品によって異なるを選ぶと明細編集を開く", () => {
    const onOpenItemEditing = vi.fn();
    render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={vi.fn()}
        onOpenItemEditing={onOpenItemEditing}
        reviewForm={form}
        reviewItems={items}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "商品によって異なる" }));
    expect(onOpenItemEditing).toHaveBeenCalledOnce();
  });

  it("不明から既知へ直すと明細保存へ戻し、混在税率では明細編集を開く", () => {
    const onFieldChange = vi.fn();
    const onOpenItemEditing = vi.fn();
    const { rerender } = render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={onOpenItemEditing}
        reviewForm={{
          ...form,
          priceTaxTreatment: "unknown",
          taxRateComposition: "rate8",
          registrationMode: "totalOnly",
        }}
        reviewItems={items}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "表示価格に税が含まれている" }));
    expect(onFieldChange).toHaveBeenCalledWith("registrationMode", "detailed");

    onFieldChange.mockClear();
    rerender(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={onOpenItemEditing}
        reviewForm={{
          ...form,
          priceTaxTreatment: "included",
          taxRateComposition: "unknown",
          registrationMode: "totalOnly",
        }}
        reviewItems={items}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "表示価格にあとから税が加算される" }));
    expect(onFieldChange).toHaveBeenCalledWith("registrationMode", "totalOnly");
    expect(onFieldChange).not.toHaveBeenCalledWith("registrationMode", "detailed");

    rerender(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={onFieldChange}
        onOpenItemEditing={onOpenItemEditing}
        reviewForm={{ ...form, priceTaxTreatment: "included" }}
        reviewItems={items}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "8%と10%が混ざっている" }));
    expect(onOpenItemEditing).toHaveBeenCalledOnce();
  });

  it("商品単位の税修正は混在を選んだ時だけ表示する", () => {
    const { rerender } = render(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={vi.fn()}
        onOpenItemEditing={vi.fn()}
        reviewForm={{ ...form, priceTaxTreatment: "included", taxRateComposition: "rate8" }}
        reviewItems={items}
      />,
    );
    expect(screen.queryByRole("heading", { name: "商品ごとの税率を確認" })).not.toBeInTheDocument();

    rerender(
      <ReceiptTaxCorrectionPanel
        draft={draft}
        onFieldChange={vi.fn()}
        onOpenItemEditing={vi.fn()}
        reviewForm={{ ...form, priceTaxTreatment: "perItem", taxRateComposition: "mixed" }}
        reviewItems={[
          {
            ...items[0]!,
            taxResolutionStatus: "unresolved",
            taxRatePercent: null,
            amountBasis: "unknown",
          },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "商品ごとの税率を確認" })).toBeVisible();
  });
});
