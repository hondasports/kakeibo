import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ReviewDialog } from "./ReviewDialog";
import {
  legacyTaxSummaryVariants,
  mixedTaxReviewFixture,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTaxPreviewTestHelpers";

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
  it("照合が一致しても割引対象の税率差を案内し、全体一致を表示しない", () => {
    const common = {
      categoryId: "food",
      amountBasis: "tax_included" as const,
      taxAllocationStatus: "allocated" as const,
      taxResolutionStatus: "resolved" as const,
      taxResolutionSource: "item_explicit" as const,
    };
    const saved = [
      {
        ...common,
        _id: "a",
        itemName: "商品A",
        lineType: "item" as const,
        amountYen: 110,
        printedAmountYen: 110,
        normalizedAmountYen: 110,
        taxRatePercent: 10 as const,
      },
      {
        ...common,
        _id: "b",
        itemName: "商品B",
        lineType: "item" as const,
        amountYen: 216,
        printedAmountYen: 216,
        normalizedAmountYen: 216,
        taxRatePercent: 8 as const,
      },
      {
        ...common,
        _id: "c",
        itemName: "クーポン",
        lineType: "discount" as const,
        amountYen: -1,
        printedAmountYen: -1,
        normalizedAmountYen: -1,
        taxRatePercent: 10 as const,
      },
    ];
    render(
      <ReviewDialog
        {...props}
        persistedReviewItems={saved}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
          taxSummaries: [
            {
              taxRatePercent: 10,
              taxMode: "included",
              taxableAmountYen: 325,
              taxableAmountBasis: "tax_included",
              taxYen: 29,
              roundingMethod: "unknown",
              status: "verified",
              warnings: [],
            },
          ],
        }}
        reviewForm={{ ...props.reviewForm, amountYen: "325" }}
        reviewItems={saved.map((item) => ({
          ...item,
          id: item._id,
          persistedItemId: item._id,
          amountYen: String(item.amountYen),
          ...(item._id === "c" ? { discountTargetItemId: "b" } : {}),
        }))}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        /割引の対象税率が対象商品（8%）と異なります/,
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).queryByText(
        /印字額と明細の金額が一致しています/,
      ),
    ).not.toBeInTheDocument();
  });
  it("明細を税抜に変更すると金額確認の差額が消え、上部の確認状態が一致に変わる", async () => {
    const item = {
      ...props.reviewItems[0],
      persistedItemId: "food",
      amountYen: "100",
      printedAmountYen: 100,
      amountBasis: "tax_included" as const,
      taxRatePercent: 10 as const,
      taxResolutionStatus: "resolved" as const,
      taxResolutionSource: "item_explicit" as const,
    };
    const base = {
      ...props,
      reviewForm: {
        ...props.reviewForm,
        amountYen: "110",
        priceTaxTreatment: undefined,
        taxRateComposition: undefined,
      },
      reviewItems: [item],
    };
    const onAmountBasisChange = vi.fn();
    const { rerender } = render(
      <ReviewDialog {...base} onAmountBasisChange={onAmountBasisChange} />,
    );
    expect(
      within(screen.getByRole("region", { name: "確認結果" })).getByText("10円"),
    ).toBeVisible();
    const row = screen.getByText("ホットケーキ").closest("details")!;
    if (!row.hasAttribute("open")) await userEvent.click(row.querySelector("summary")!);
    await userEvent.click(within(row).getByRole("combobox", { name: "ホットケーキの表示価格" }));
    await userEvent.click(screen.getByRole("option", { name: "税抜" }));
    expect(onAmountBasisChange).toHaveBeenCalledWith("food", "tax_excluded");
    rerender(
      <ReviewDialog
        {...base}
        onAmountBasisChange={onAmountBasisChange}
        reviewItems={[
          {
            ...item,
            amountBasis: "tax_excluded",
            normalizedAmountYen: 110,
            allocatedTaxYen: 10,
            taxAllocationStatus: "allocated",
          },
        ]}
      />,
    );
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        "金額は一致しています",
      ),
    ).toBeVisible();
    expect(screen.queryByText("確認結果：計算した金額が一致しています。")).not.toBeInTheDocument();
  });

  it("明示された税込・税抜の根拠だけを表示する", () => {
    const draft = {
      ...props.selectedReviewDraft!,
      receiptTaxDecision: {
        priceTaxTreatment: "excluded" as const,
        taxRateComposition: "rate8" as const,
        resolutionStatus: "verified" as const,
        resolutionSource: "explicitLabel" as const,
        evidence: ["explicit_label:excluded"],
        reasons: [],
        candidates: [],
        taxAmount: { roundingMethod: "round" as const, source: "unknown" as const },
      },
    };
    const { rerender } = render(<ReviewDialog {...props} selectedReviewDraft={draft} />);
    expect(screen.getByText("レシートに「税抜」の表記があります")).toBeVisible();
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...draft,
          receiptTaxDecision: { ...draft.receiptTaxDecision, evidence: [] },
        }}
      />,
    );
    expect(screen.queryByText("レシートに「税抜」の表記があります")).not.toBeInTheDocument();
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...draft,
          receiptTaxDecision: {
            ...draft.receiptTaxDecision,
            evidence: ["explicit_label:included"],
          },
        }}
      />,
    );
    expect(screen.getByText("レシートに「税込」の表記があります")).toBeVisible();
  });
  it.each([{ categoryId: "" }, { amountYen: "oops" }])(
    "割引対象が未選択でも必須エラーから割引行へ移動する",
    async (invalid) => {
      const onSubmit = vi.fn();
      render(
        <ReviewDialog
          {...props}
          onSubmit={onSubmit}
          reviewItems={[props.reviewItems[0], { ...props.reviewItems[1], ...invalid }]}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent("保存前に修正が必要");
      await userEvent.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));
      const discountRow = screen.getByText("割引", { exact: true }).closest("details")!;
      expect(discountRow).toHaveAttribute("open");
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );
  it("選択済みの未確認明細は理由と確認操作を表示し、読み取り失敗と決めつけない", async () => {
    const user = userEvent.setup();
    const onConfirmItemTax = vi.fn();
    render(
      <ReviewDialog
        {...props}
        reviewForm={{
          ...props.reviewForm,
          amountYen: "116",
        }}
        reviewItems={[
          {
            ...props.reviewItems[0],
            persistedItemId: "food",
            amountBasis: "tax_included",
            taxResolutionStatus: "unresolved",
            taxConfirmedFields: [],
          },
        ]}
        onConfirmItemTax={onConfirmItemTax}
      />,
    );
    const row = screen.getByText("ホットケーキ").closest("details")!;
    await user.click(row.querySelector("summary")!);
    expect(within(row).getByRole("combobox", { name: "ホットケーキの税率" })).toHaveTextContent(
      "8%",
    );
    // 3条件（登録額が決まり、金額が一致し、修正必須がない）を満たすため一致時表示になり、行内の確認案内は出さない。確認操作は残す。
    expect(screen.getByRole("region", { name: "全体の確認状態" })).toHaveTextContent(
      "金額は一致しています",
    );
    expect(
      screen.queryByText(/表示中の税率・税込／税抜はまだ確認されていません/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/税内訳を読み取れていません/)).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "この税設定を確認する" }));
    expect(onConfirmItemTax).toHaveBeenCalledExactlyOnceWith("food", 8, "tax_included");
  });
  it("金額が一致し登録額が決まれば、未検証の税内訳による比較不能も確認案内に出さない（Issue #1563）", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              {
                rawText: "8%対象額 246円",
                amountYen: 246,
                amountText: "246",
                lineRoleCandidates: ["tax"],
                roleConfidence: 1,
                explicitlyPrinted: true,
                sourceLineIndex: 0,
              },
              {
                rawText: "外税8% 20円",
                amountYen: 20,
                amountText: "20",
                lineRoleCandidates: ["tax"],
                roleConfidence: 1,
                explicitlyPrinted: true,
                sourceLineIndex: 1,
              },
              {
                rawText: "合計 265円",
                amountYen: 265,
                amountText: "265",
                lineRoleCandidates: ["total"],
                roleConfidence: 1,
                explicitlyPrinted: true,
                sourceLineIndex: 2,
              },
            ],
          },
          taxSummaries: [
            {
              taxRatePercent: 8,
              taxMode: "external",
              taxableAmountYen: 246,
              taxableAmountBasis: "tax_excluded",
              taxYen: 19,
              roundingMethod: "floor",
              warnings: ["contradictory_receipt_tax_evidence"],
              status: "contradictory",
            },
          ],
        }}
        reviewForm={{
          ...props.reviewForm,
          amountYen: "265",
        }}
        reviewItems={[108, 138].map((amount, index) => ({
          id: `item-${index}`,
          itemName: `商品${index}`,
          amountYen: String(amount),
          printedAmountYen: amount,
          categoryId: "food",
          amountBasis: "tax_excluded" as const,
          taxRatePercent: 8 as const,
          taxResolutionStatus: "resolved" as const,
          taxResolutionSource: "item_explicit" as const,
          taxAllocationStatus: "unallocated" as const,
        }))}
      />,
    );
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).queryByText("商品の金額を確認してください")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });

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
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).queryByText("レシート全体の確認")).not.toBeInTheDocument();
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(screen.queryByText("確認結果：計算した金額が一致しています。")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });
  it("金額が一致し税率別が比較不能なら両方の状態を表示する", () => {
    render(<ReviewDialog {...props} />);
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("税率別集計")).toBeVisible();
    expect(within(region).getByText("金額確認")).toBeVisible();
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
    expect(
      within(screen.getByRole("region", { name: "確認結果" })).getByText("24円"),
    ).toBeVisible();
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

describe("読込中・不存在の表示", () => {
  it("読込中はフォーム形のSkeletonを表示し、フォームは出さない", () => {
    render(<ReviewDialog {...props} isReviewDraftLoading />);
    expect(screen.getByLabelText("下書きを読み込んでいます")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "店名・内容" })).not.toBeInTheDocument();
  });

  it("不存在のときはAlertから閉じられる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReviewDialog {...props} isReviewDraftNotFound onClose={onClose} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("下書きが見つかりません");
    await user.click(within(alert).getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("保存仕様の説明", () => {
  it("冒頭は実際の保存タイミングと保存ボタンの文言に一致する", () => {
    render(<ReviewDialog {...props} />);
    const status = screen.getByLabelText("保存状態");
    const saveButton = screen.getByRole("button", { name: "下書きを保存" });
    expect(status).toHaveTextContent(`「${saveButton.textContent}」で下書きに保存されます`);
    expect(status).toHaveTextContent("登録は一覧の「登録する」から行います");
    expect(status).not.toHaveTextContent("変更は下書きに保存されます");
    expect(status).not.toHaveTextContent("変更ごとに下書きへ保存されます");
    expect(status).not.toHaveTextContent("この内容で保存」で保存します");
    expect(screen.getByText("閉じると未保存の入力は失われます。")).toBeInTheDocument();
  });

  it("修正必須があるときは保存ではなく修正導線であることが分かる文言にする", () => {
    render(<ReviewDialog {...props} reviewForm={{ ...props.reviewForm, shopName: "" }} />);
    const status = screen.getByLabelText("保存状態");
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeInTheDocument();
    expect(status).toHaveTextContent("修正が必要な項目を直すと下書きに保存できます");
    expect(status).toHaveTextContent("登録は一覧の「登録する」から行います");
    expect(status).not.toHaveTextContent("で下書きに保存されます");
  });
});

describe("Issue #892 現在の税内訳に揃えた表示", () => {
  it.each(Object.entries(legacyTaxSummaryVariants()))(
    "1782円の混在税（旧形式 %s）も確認0件で、原文を確認でき内部値の編集はない",
    async (_caseName, taxSummaries) => {
      const user = userEvent.setup();
      const fixture = mixedTaxReviewFixture();
      render(
        <ReviewDialog
          {...props}
          selectedReviewDraft={{ ...fixture.draft, taxSummaries }}
          reviewForm={fixture.form}
          reviewItems={fixture.items}
        />,
      );
      expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
          "金額は一致しています",
        ),
      ).toBeVisible();
      await user.click(screen.getByText("読み取り原文（参考）"));
      expect(screen.getByRole("list", { name: "OCR原文" })).toHaveTextContent("合計 1,782円");
      expect(screen.queryByRole("spinbutton", { name: "対象額" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "税内訳を確認" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "税内訳を修正" })).not.toBeInTheDocument();
    },
  );

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
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        "金額は一致しています",
      ),
    ).toBeVisible();
  });
});

it("個別修正した税込登録額を再描画で上書きしない", async () => {
  const user = userEvent.setup();
  render(
    <ReviewDialog
      {...props}
      reviewForm={{ ...props.reviewForm, amountYen: "110" }}
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

describe("Issue #1563 金額が一致している下書きの表示", () => {
  // 内税レシートの本番状態（183・183・194円、支払額560円、8%対象は読み取り原文のみ）
  const matchedDraft = () => ({
    ...props.selectedReviewDraft!,
    amountYen: 560,
    reviewReasons: ["low_confidence"],
    rawObservation: {
      source: "ai_ocr" as const,
      observedAt: 1,
      lines: [
        {
          rawText: "合計 560円",
          amountYen: 560,
          amountText: "560",
          lineRoleCandidates: ["total"] as ["total"],
          roleConfidence: 1,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
        },
        {
          rawText: "(8%対象 ¥519 消費税 ¥41)",
          amountYen: 519,
          amountText: "519",
          lineRoleCandidates: ["tax"] as ["tax"],
          roleConfidence: 1,
          explicitlyPrinted: true,
          sourceLineIndex: 1,
        },
      ],
    },
    taxSummaries: [
      {
        taxRatePercent: 8 as const,
        taxMode: "included" as const,
        taxableAmountYen: 519,
        taxableAmountBasis: "tax_excluded" as const,
        taxYen: 41,
        roundingMethod: "round" as const,
        warnings: [],
      },
    ],
  });
  const matchedItem = (id: string, amountYen: number, allocatedTaxYen: number) => ({
    id,
    persistedItemId: id,
    itemName: `商品${id}`,
    amountYen: String(amountYen),
    printedAmountYen: amountYen,
    normalizedAmountYen: amountYen,
    categoryId: "food",
    amountBasis: "tax_included" as const,
    taxRatePercent: 8 as const,
    taxResolutionStatus: "resolved" as const,
    taxResolutionSource: "item_explicit" as const,
    taxAllocationStatus: "allocated" as const,
    allocatedTaxYen,
  });
  const matchedItems = () => [
    matchedItem("a", 183, 13),
    matchedItem("b", 183, 13),
    matchedItem("c", 194, 15),
  ];
  const matchedForm = { ...props.reviewForm, amountYen: "560" };
  const ACCESSORY_TEXTS = [
    /レシート全体の確認/,
    /商品の金額を確認してください/,
    /の商品とレシートの照合/,
    /確認推奨/,
    /確認事項があります/,
  ];

  it("A: 一致時は成功の見出しと商品合計・支払額だけを表示し、確認案内を出さない", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={matchedDraft()}
        reviewForm={matchedForm}
        reviewItems={matchedItems()}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（3件）")).toBeVisible();
    expect(within(banner).getByText("支払額")).toBeVisible();
    expect(within(banner).getAllByText("560円")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
    for (const text of ACCESSORY_TEXTS) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("確認箇所へ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この内容で保存" })).toBeEnabled();
    expect(screen.getByLabelText("保存状態")).toHaveTextContent(
      "「この内容で保存」で下書きに保存されます",
    );
  });

  it("B: 一致時に商品の金額を変えて一致しなくなると、確認件数と金額の案内を出す", () => {
    const { rerender } = render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={matchedDraft()}
        reviewForm={matchedForm}
        reviewItems={matchedItems()}
      />,
    );
    const changed = matchedItems();
    changed[0] = {
      ...changed[0],
      amountYen: "184",
      printedAmountYen: 184,
      normalizedAmountYen: 184,
    };
    rerender(
      <ReviewDialog
        {...props}
        selectedReviewDraft={matchedDraft()}
        reviewForm={matchedForm}
        reviewItems={changed}
      />,
    );
    expect(screen.queryByText("金額は一致しています")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("修正必須 1件"),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        "印字額と明細の金額が一致していません",
      ),
    ).toBeVisible();
  });

  it("C: 必須項目（店名）が空なら一致時扱いにせず、修正必須と確認件数を出す", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={matchedDraft()}
        reviewForm={{ ...matchedForm, shopName: "" }}
        reviewItems={matchedItems()}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("修正必須 1件"),
    ).toBeVisible();
    expect(screen.queryByText("金額は一致しています")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeInTheDocument();
  });

  it("F: 税設定が未確認の商品が残っても、3条件を満たせば一致時表示にし、税の確認操作は残す", () => {
    const items = [
      {
        ...matchedItem("a", 183, 13),
        taxResolutionStatus: "unresolved" as const,
        taxConfirmedFields: [],
      },
      matchedItem("b", 183, 13),
      matchedItem("c", 194, 15),
    ];
    render(
      <ReviewDialog
        {...props}
        // 税内訳があると画面の商品の税設定は再計算されるため、税内訳なしで未確認を残す。
        selectedReviewDraft={{ ...matchedDraft(), taxSummaries: undefined }}
        reviewForm={matchedForm}
        reviewItems={items}
        onConfirmItemTax={vi.fn()}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/表示中の税率・税込／税抜はまだ確認されていません/),
    ).not.toBeInTheDocument();
    // 商品行は折りたたまれているが、税の確認操作は残る。
    expect(screen.getByRole("button", { name: "この税設定を確認する" })).toBeInTheDocument();
  });
  it("D: 税抜明細の一致は商品の合計を税込で示し、支払額と同額にする", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{
          ...props.selectedReviewDraft!,
          amountYen: 110,
          taxSummaries: [
            {
              taxRatePercent: 10,
              taxMode: "external",
              taxableAmountYen: 100,
              taxableAmountBasis: "tax_excluded",
              taxYen: 10,
              roundingMethod: "round",
              warnings: [],
            },
          ],
        }}
        reviewForm={{ ...props.reviewForm, amountYen: "110" }}
        reviewItems={[
          {
            id: "a",
            persistedItemId: "a",
            itemName: "商品a",
            amountYen: "100",
            printedAmountYen: 100,
            normalizedAmountYen: 110,
            categoryId: "food",
            amountBasis: "tax_excluded",
            taxRatePercent: 10,
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            taxAllocationStatus: "allocated",
            allocatedTaxYen: 10,
          },
        ]}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（税込・1件）")).toBeVisible();
    expect(within(banner).getAllByText("110円")).toHaveLength(2);
  });
  it("G: 税込と税抜が混在しても、商品の合計は税込として示す（判定が一致する場合）", () => {
    render(
      <ReviewDialog
        {...props}
        selectedReviewDraft={{ ...props.selectedReviewDraft!, amountYen: 218 }}
        reviewForm={{ ...props.reviewForm, amountYen: "218" }}
        reviewItems={[
          {
            id: "a",
            persistedItemId: "a",
            itemName: "商品a",
            amountYen: "108",
            printedAmountYen: 108,
            normalizedAmountYen: 108,
            categoryId: "food",
            amountBasis: "tax_included",
            taxRatePercent: 8,
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            taxAllocationStatus: "allocated",
            allocatedTaxYen: 8,
          },
          {
            id: "b",
            persistedItemId: "b",
            itemName: "商品b",
            amountYen: "100",
            printedAmountYen: 100,
            normalizedAmountYen: 110,
            categoryId: "food",
            amountBasis: "tax_excluded",
            taxRatePercent: 10,
            taxResolutionStatus: "resolved",
            taxResolutionSource: "item_explicit",
            taxAllocationStatus: "allocated",
            allocatedTaxYen: 10,
          },
        ]}
      />,
    );
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（税込・2件）")).toBeVisible();
    expect(within(banner).getAllByText("218円")).toHaveLength(2);
  });
});
