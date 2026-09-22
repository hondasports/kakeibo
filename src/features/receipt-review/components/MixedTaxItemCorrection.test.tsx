import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AiExpenseDraft, ReviewItemValues } from "../types/types";
import { MixedTaxItemCorrection } from "./MixedTaxItemCorrection";

const draft: AiExpenseDraft = {
  _id: "draft-1",
  status: "needs_review",
  documentType: "receipt",
  imageFileName: "receipt.jpg",
  reviewReasons: ["amount_mismatch"],
  rawObservation: {
    source: "ai_ocr",
    observedAt: 1,
    lines: [
      {
        rawText: "牛乳 108円",
        amountText: "108円",
        amountYen: 108,
        lineRoleCandidates: ["item"],
        roleConfidence: 0.9,
        explicitlyPrinted: true,
        sourceLineIndex: 0,
        boundingBox: { left: 0.1, top: 0.2, width: 0.8, height: 0.1 },
      },
    ],
  },
};

const items: ReviewItemValues[] = [
  {
    id: "resolved",
    itemName: "パン",
    amountYen: "216",
    categoryId: "cat-1",
    taxRatePercent: 8,
    amountBasis: "tax_included",
    normalizedAmountYen: 216,
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
  },
  {
    id: "unresolved",
    itemName: "牛乳",
    amountYen: "108",
    categoryId: "cat-1",
    taxRatePercent: null,
    amountBasis: "unknown",
    taxResolutionStatus: "unresolved",
    taxReviewReasons: ["unresolved_tax_rate"],
  },
];

describe("MixedTaxItemCorrection", () => {
  it("要確認の商品だけを先頭から修正でき、解決済み集計を表示する", async () => {
    const user = userEvent.setup();
    const onTaxRateChange = vi.fn();
    const onAmountBasisChange = vi.fn();
    render(
      <MixedTaxItemCorrection
        draft={draft}
        items={items}
        onAmountBasisChange={onAmountBasisChange}
        onTaxRateChange={onTaxRateChange}
        priceTaxTreatment="perItem"
      />,
    );

    expect(
      screen.getByText("AIで確定できた1件はそのまま使います。", { exact: false }),
    ).toBeVisible();
    expect(screen.getByText("8% 216円")).toBeVisible();
    expect(screen.queryByRole("button", { name: /パン/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "牛乳の税率" }));
    expect(screen.getByRole("option", { name: "非課税" })).toBeVisible();
    await user.click(screen.getByRole("option", { name: "8%" }));
    expect(onTaxRateChange).toHaveBeenCalledWith("unresolved", 8);

    await user.click(screen.getByRole("combobox", { name: "牛乳の表示価格" }));
    await user.click(screen.getByRole("option", { name: "税込" }));
    expect(onAmountBasisChange).toHaveBeenCalledWith("unresolved", "tax_included");
  });

  it("画像がある場合はSP開閉導線と印字位置ハイライトを表示する", async () => {
    const user = userEvent.setup();
    render(
      <MixedTaxItemCorrection
        draft={draft}
        imageDataUrl="data:image/png;base64,image"
        items={items}
      />,
    );

    await user.click(screen.getByRole("button", { name: "レシートを見る" }));
    expect(screen.getAllByRole("img", { name: "receipt.jpgの確認画像" }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("牛乳の印字位置").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("receipt-image-coordinate-system")[0]).toHaveStyle({
      display: "inline-flex",
      maxWidth: "100%",
      position: "relative",
    });
  });
});
