import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ReviewDialog } from "./ReviewDialog";
import { mixedTaxReviewFixture } from "../utils/reviewTaxPreviewTestHelpers";

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
  it("一致時は全体の読み取り確認を個別推奨に数えず、重複表示もしない", () => {
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
    expect(within(banner).queryByText("レシート全体の確認")).not.toBeInTheDocument();
    expect(within(banner).getByText(/印字額と明細の金額が一致しています/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("金額が一致");
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });
  it("金額が一致し税率別が比較不能なら税率別集計カードだけを表示する", () => {
    render(<ReviewDialog {...props} />);
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("税率別集計")).toBeVisible();
    expect(within(region).queryByText("金額確認")).not.toBeInTheDocument();
  });
  it("金額が比較不能で税率別が一致なら金額確認カードだけを表示する", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
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
        reviewForm={{ ...props.reviewForm, amountYen: "" }}
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
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("金額確認")).toBeVisible();
    expect(within(region).queryByText("税率別集計")).not.toBeInTheDocument();
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
    expect(within(banner).getByText("印字額と明細の金額が一致していません")).toBeVisible();
    expect(within(banner).getByText(/差額 24円/)).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "金額を確認する" }));
    expect(screen.getByRole("region", { name: "確認結果" })).toBeInTheDocument();
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
              taxableAmountBasis: "tax_excluded",
              taxYen: 6,
              roundingMethod: "floor",
              warnings: [],
              status: "conflicting",
            },
          ],
        }}
      />,
    );
    const reference = screen.getByText("読み取り原文・詳しい税情報（参考）").closest("details")!;
    expect(reference).not.toHaveAttribute("open");
    await user.click(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByRole("button", {
        name: "税率を確認する",
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
  it("商品ごとの問題を全体バナーへ重複表示せず、商品行から修正できる", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...props} />);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).queryByText(/割引対象の商品を選択/)).not.toBeInTheDocument();
    const discountRow = screen.getByText("割引", { exact: true }).closest("details")!;
    expect(discountRow).not.toHaveAttribute("open");
    await user.click(discountRow.querySelector("summary")!);
    expect(discountRow).toHaveAttribute("open");
    expect(screen.getByRole("combobox", { name: "割引対象の商品" })).toBeVisible();
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
    expect(screen.getByRole("button", { name: "下書きを保存" })).toBeDisabled();
  });
  it("税内訳がない下書きでも永続化済み明細の税率・税込／税抜を修正できる", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        reviewItems={[
          { ...props.reviewItems[0], persistedItemId: "item-food" },
          props.reviewItems[1],
        ]}
      />,
    );
    const item = screen.getByText("ホットケーキ").closest("details")!;
    if (!item.hasAttribute("open")) {
      await user.click(item.querySelector("summary")!);
    }
    expect(screen.getByRole("combobox", { name: "ホットケーキの税率" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "ホットケーキの表示価格" })).toBeEnabled();
  });
  it("割引対象が未確定でも確認項目を残したまま下書きを保存できる", async () => {
    const user = userEvent.setup();
    render(<ReviewDialog {...props} />);
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).queryByText(
        /割引対象の商品を選択/,
      ),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));
    expect(props.onSubmit).toHaveBeenCalledWith(false, "detailed");
  });
});

describe("Issue #892 現在の税内訳に揃えた表示", () => {
  it("支払合計がずれた補完済み8%だけを修正し、税額保存後にフォームを隠す", async () => {
    const user = userEvent.setup();
    const fixture = mixedTaxReviewFixture();
    const onSummaryChange = vi.fn();
    const eightPercent = { ...fixture.draft.taxSummaries![0], taxYen: 52 };
    const sourceDraft = {
      ...fixture.draft,
      taxSummaries: [fixture.draft.taxSummaries![1], eightPercent, eightPercent],
    };
    const { rerender } = render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={sourceDraft}
        reviewForm={fixture.form}
        reviewItems={fixture.items}
        onTaxSummaryChange={onSummaryChange}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(
      within(banner).getByText(/8%の税内訳：明細の税込合計 1,781円 ／ 支払合計 1,782円/),
    ).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "税内訳を修正" }));
    const editor = screen.getByRole("region", { name: "8%の税内訳を修正" });
    expect(within(editor).getByRole("combobox", { name: "税率" })).toHaveFocus();
    expect(screen.queryByRole("region", { name: "10%の税内訳を修正" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "保存" })).toHaveLength(1);
    const tax = within(editor).getByRole("spinbutton", { name: "税額" });
    expect(tax).toHaveValue(52);
    await user.clear(tax);
    await user.type(tax, "53");
    await user.click(within(editor).getByRole("button", { name: "保存" }));
    expect(onSummaryChange).toHaveBeenCalledWith(1, { taxYen: 53 });
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={fixture.draft}
        reviewForm={fixture.form}
        reviewItems={fixture.items}
        onTaxSummaryChange={onSummaryChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "税内訳を確認" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "OCR原文" })).toHaveTextContent("合計 1,782円");
    expect(screen.getByRole("region", { name: "確認件数" })).toHaveTextContent("確認推奨 0件");
  });

  it("1782円の混在税は確認0件で、参考欄に税内訳フォームや余白を残さない", async () => {
    const user = userEvent.setup();
    const fixture = mixedTaxReviewFixture();
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={fixture.draft}
        reviewForm={fixture.form}
        reviewItems={fixture.items}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("確認推奨 0件"),
    ).toBeVisible();
    await user.click(screen.getByText("読み取り原文・詳しい税情報（参考）"));
    expect(screen.getByRole("list", { name: "OCR原文" })).toHaveTextContent("合計 1,782円");
    expect(screen.queryByLabelText("税率別集計", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "税内訳を確認" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
  });

  it("未解決の10%だけ表示し、元番号のフォームへフォーカスして保存できる", async () => {
    const user = userEvent.setup();
    const fixture = mixedTaxReviewFixture();
    const onSummaryChange = vi.fn();
    const unresolvedDraft = {
      ...fixture.draft,
      taxSummaries: [
        fixture.draft.taxSummaries![0],
        fixture.draft.taxSummaries![0],
        { ...fixture.draft.taxSummaries![1], taxableAmountBasis: "tax_excluded" as const },
      ],
    };
    const { rerender } = render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={unresolvedDraft}
        reviewForm={fixture.form}
        reviewItems={fixture.items}
        onTaxSummaryChange={onSummaryChange}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText(/10%の税内訳：内税として/)).toBeVisible();
    expect(
      within(banner).queryByText(/印字額と明細の金額が一致しています/),
    ).not.toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "税内訳を修正" }));
    const editor = screen.getByRole("region", { name: "10%の税内訳を修正" });
    expect(editor).toContainElement(document.activeElement as HTMLElement);
    expect(screen.queryByRole("region", { name: "8%の税内訳を修正" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "保存" })).toHaveLength(1);
    const target = within(editor).getByRole("spinbutton", { name: "対象額" });
    await user.clear(target);
    await user.type(target, "1061");
    // 税更新中などの親再描画でフォームの入力を失わない。
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={unresolvedDraft}
        reviewForm={fixture.form}
        reviewItems={fixture.items.map((item, index) =>
          index === 0 ? { ...item, itemName: "食品の名称を修正" } : item,
        )}
        onTaxSummaryChange={onSummaryChange}
        reviewError=""
      />,
    );
    expect(target).toHaveValue(1061);
    await user.click(within(editor).getByRole("button", { name: "保存" }));
    expect(onSummaryChange).toHaveBeenCalledWith(2, { taxableAmountYen: 1061 });
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={fixture.draft}
        reviewForm={fixture.form}
        reviewItems={fixture.items}
        onTaxSummaryChange={onSummaryChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("税率別集計", { exact: true })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("確認推奨 0件"),
    ).toBeVisible();
  });

  it("両方unknownの税宣言はフォームに残し、モードを保存すると確認が消える", async () => {
    const user = userEvent.setup();
    const onSummaryChange = vi.fn();
    const source = {
      taxRatePercent: 8 as const,
      taxMode: "unknown" as const,
      taxableAmountYen: 100,
      taxableAmountBasis: "unknown" as const,
      taxYen: 8,
      roundingMethod: "floor" as const,
      warnings: [],
      status: "ambiguous" as const,
    };
    const draft = { ...props.selectedReviewDraft!, taxSummaries: [source] };
    const form = {
      ...props.reviewForm,
      amountYen: "108",
      priceTaxTreatment: undefined,
      taxRateComposition: undefined,
    };
    const items = [
      {
        ...props.reviewItems[0],
        amountYen: "100",
        printedAmountYen: 100,
        amountBasis: "tax_excluded" as const,
      },
    ];
    const { rerender } = render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={draft}
        reviewForm={form}
        reviewItems={items}
        onTaxSummaryChange={onSummaryChange}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText(/8%の税内訳：.*未確定/)).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "税内訳を修正" }));
    const editor = screen.getByRole("region", { name: "8%の税内訳を修正" });
    expect(within(editor).getByRole("combobox", { name: "税モード" })).toHaveTextContent("不明");
    await user.click(within(editor).getByRole("combobox", { name: "税モード" }));
    await user.click(screen.getByRole("option", { name: "外税" }));
    await user.click(within(editor).getByRole("button", { name: "保存" }));
    expect(onSummaryChange).toHaveBeenCalledWith(0, { taxMode: "external" });
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{ ...draft, taxSummaries: [{ ...source, taxMode: "external" }] }}
        reviewForm={form}
        reviewItems={items}
      />,
    );
    expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("確認推奨 0件"),
    ).toBeVisible();
  });

  it("保存済み全体8%外税の金額を変更しても画面の登録額は216円になる", async () => {
    const user = userEvent.setup();
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "external",
              taxableAmountYen: 100,
              taxableAmountBasis: "tax_excluded",
              taxYen: 8,
              roundingMethod: "round",
              warnings: [],
            },
          ],
        }}
        reviewForm={{
          ...props.reviewForm,
          amountYen: "216",
          priceTaxTreatment: "excluded",
          taxRateComposition: "rate8",
        }}
        reviewItems={[
          {
            ...props.reviewItems[0],
            amountYen: "200",
            printedAmountYen: 200,
            amountBasis: "tax_excluded",
            normalizedAmountYen: 216,
            allocatedTaxYen: 16,
            taxAllocationStatus: "allocated",
          },
        ]}
      />,
    );
    const item = screen.getByText("ホットケーキ").closest("details")!;
    await user.click(item.querySelector("summary")!);
    expect(within(item as HTMLElement).getByText("登録額: 216円（税込）")).toBeVisible();
    expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("確認推奨 0件"),
    ).toBeVisible();
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
