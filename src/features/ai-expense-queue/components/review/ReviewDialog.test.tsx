import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ReviewDialog } from "./ReviewDialog";

const props: ComponentProps<typeof ReviewDialog> = {
  open: true,
  categories: [{ _id: "food", name: "食費", color: "#886644" }],
  isReviewDraftLoading: false,
  isReviewDraftNotFound: false,
  selectedReviewDraft: {
    _id: "draft",
    status: "needs_review",
    documentType: "receipt",
    reviewReasons: [],
  },
  reviewError: "",
  reviewForm: {
    documentType: "receipt",
    shopName: "ジャパン",
    date: "2026-08-06",
    amountYen: "92",
    categoryId: "food",
    registrationMode: "detailed",
    priceTaxTreatment: "included",
    taxRateComposition: "mixed",
  },
  reviewItems: [
    {
      id: "food",
      itemName: "ホットケーキ",
      amountYen: "116",
      categoryId: "food",
      taxRatePercent: 8,
      taxResolutionStatus: "resolved",
    },
    { id: "discount", itemName: "割引", amountYen: "-24", categoryId: "food" },
  ],
  isCategorySplit: false,
  reviewSubmitting: false,
  onClose: vi.fn(),
  onFieldChange: vi.fn(),
  onItemChange: vi.fn(),
  onAddItem: vi.fn(),
  onRemoveItem: vi.fn(),
  onCategorySplitChange: vi.fn(),
  onAssignCategoryToItems: vi.fn(),
  onDiscountTargetChange: vi.fn(),
  onSubmit: vi.fn(),
  onResetToAiInterpretation: vi.fn(),
};

describe("下書きの修正導線", () => {
  it("全体の読み取り確認を個別推奨に数えず、バナーに理由を表示する", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
          reviewReasons: ["low_confidence"],
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "included",
              taxableAmountYen: 116,
              taxableAmountBasis: "tax_included",
              taxYen: 8,
              roundingMethod: "floor",
              warnings: [],
            },
          ],
        }}
        reviewForm={{ ...props.reviewForm, amountYen: "116" }}
        reviewItems={[
          {
            ...props.reviewItems[0],
            amountBasis: "tax_included",
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            allocatedTaxYen: 8,
          },
        ]}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("確認推奨 0件"),
    ).toBeVisible();
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("レシート全体の確認")).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "商品一覧を見比べる" }));
    expect(screen.getByRole("region", { name: "商品一覧" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("金額が一致");
  });
  it("金額の不一致は差額だけを示し、確認ボタンから商品一覧へ移動できる", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        reviewItems={[
          {
            ...props.reviewItems[0],
            amountBasis: "tax_included",
            taxRatePercent: 0,
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
          },
        ]}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(
      within(banner).getByText("印字額と明細の金額が一致していません"),
    ).toBeVisible();
    expect(within(banner).getByText(/差額 24円/)).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "金額を確認する" }));
    const checks = screen.getByRole("region", { name: "確認結果" });
    expect(within(checks).getByText("金額確認")).toBeVisible();
    expect(within(checks).getByText(/差額/)).toBeVisible();
    expect(screen.getByRole("region", { name: "商品一覧" })).toBeVisible();
  });
  it("不正な明細金額の修正では金額欄へフォーカスする", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...props} reviewItems={[{ ...props.reviewItems[0], amountYen: "0" }]} />);
    await user.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));
    expect(screen.getByRole("textbox", { name: "レシートの金額" })).toHaveFocus();
  });
  it("税内訳の矛盾から折りたたみ内の修正欄へ移動できる", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        reviewItems={[]}
        selectedReviewDraft={{
          _id: "draft",
          status: "needs_review",
          documentType: "receipt",
          reviewReasons: [],
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "included",
              taxableAmountYen: 92,
              taxableAmountBasis: "unknown",
              taxYen: 6,
              roundingMethod: "floor",
              warnings: [],
              status: "conflicting",
            },
          ],
        }}
      />,
    );
    const reference = screen
      .getByText("読み取り原文・詳しい税情報（参考）")
      .closest("details")!;
    expect(reference).not.toHaveAttribute("open");
    await user.click(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByRole("button", {
        name: "確認箇所へ",
      }),
    );
    expect(reference).toHaveAttribute("open");
    expect(screen.getByRole("spinbutton", { name: "対象額" })).toBeInTheDocument();
  });
  it("編集した商品は問題が解消しても閉じず、再編集できる", async () => {
    const user = userEvent.setup();
    const item = { ...props.reviewItems[0], persistedItemId: "food" };
    const { rerender } = render(<ReviewDialog {...props} reviewItems={[item]} />);
    const field = screen.getByRole("textbox", { name: "明細名" });
    await user.click(field);
    rerender(
      <ReviewDialog
        {...props}
        reviewItems={[
          {
            ...item,
            taxRatePercent: 8,
            amountBasis: "tax_included",
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            allocatedTaxYen: 8,
          },
        ]}
      />,
    );
    expect(field).toBeVisible();
    expect(field).toHaveFocus();
    await user.type(field, "修正");
    expect(props.onItemChange).toHaveBeenCalled();
  });
  it("保存前に割引の問題と対象選択への導線を示す", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...props} />);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText(/割引対象の商品を選択/)).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "修正箇所へ" }));
    expect(screen.getByRole("combobox", { name: "割引対象の商品" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "割引対象の商品" })).toHaveFocus();
    expect(screen.getByRole("region", { name: "商品一覧" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "レシート全体の税込・税率設定" }),
    ).not.toBeInTheDocument();
  });
  it("保存失敗をフッターにも示し、税更新中は保存を待つ", () => {
    render(
      <ReviewDialog
        {...props}
        reviewError="割引対象の商品を選択してください。"
        taxUpdatingItemId="food"
      />,
    );
    expect(screen.getByText(/入力は残っています/)).toBeVisible();
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeDisabled();
  });
});

it("個別修正した税込登録額を再描画で上書きしない", async () => {
  const user = userEvent.setup();
  render(
    <ReviewDialog
      {...props}
      reviewForm={{ ...props.reviewForm, amountYen: "110", taxRateComposition: "rate8" }}
      reviewItems={[
        {
          ...props.reviewItems[0],
          amountYen: "100",
          amountBasis: "tax_excluded",
          taxRatePercent: 10,
          taxResolutionStatus: "resolved",
          taxResolutionSource: "item_explicit",
          taxAllocationStatus: "allocated",
          allocatedTaxYen: 10,
          normalizedAmountYen: 110,
        },
      ]}
    />,
  );
  const item = screen.getByText("ホットケーキ").closest("details")!;
  if (!item.hasAttribute("open")) {
    await user.click(item.querySelector("summary")!);
  }
  expect(within(item as HTMLElement).getByText("登録額: 110円（税込）")).toBeInTheDocument();
});
