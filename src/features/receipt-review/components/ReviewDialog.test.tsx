import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ReviewDialog } from "./ReviewDialog";
import { invalidateItemTaxRateConfirmation } from "../../../../lib/domain/receipt/tax/itemTaxConfirmation";
import { judgeReviewFormAmountAndTax } from "../../../../lib/domain/aiExpenseDrafts/reviewFormJudgment";
import { validateReviewInput } from "../../../../lib/domain/aiExpenseDrafts/reviewValidation";
import {
  mapDraftItemsToReviewItems,
  mapDraftToReviewForm,
} from "../../../../lib/domain/aiExpenseDrafts/reviewDraftMapping";
import { initializeReviewCategoryState } from "../../../../lib/domain/aiExpenseDrafts/reviewItemCategories";
import {
  applyReviewItemsTaxPreview,
  buildReviewTaxEvidence,
} from "../../../../lib/domain/aiExpenseDrafts/reviewItemsTaxPreview";
import type {
  AiExpenseDraft,
  AiExpenseDraftItem,
  ReviewFormValues,
  ReviewItemValues,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";
import { legacyTaxSummaryVariants } from "../../../../lib/domain/aiExpenseDrafts/reviewTaxPreviewTestHelpers";

type ReviewDialogProps = ComponentProps<typeof ReviewDialog>;

/** 保存済みの下書きと商品から、画面の初期化（useReviewFormState）と同じ変換で ReviewDialog の props を作る。 */
function reviewDialogPropsFromStoredDraft(
  draft: AiExpenseDraft,
  items: AiExpenseDraftItem[],
): {
  selectedReviewDraft: AiExpenseDraft;
  reviewForm: ReviewFormValues;
  reviewItems: ReviewItemValues[];
  persistedReviewItems: AiExpenseDraftItem[];
  isCategorySplit: boolean;
} {
  const mappedForm = mapDraftToReviewForm(draft);
  const categoryState = initializeReviewCategoryState(
    mapDraftItemsToReviewItems(items),
    mappedForm.categoryId,
  );
  return {
    selectedReviewDraft: draft,
    reviewForm: { ...mappedForm, categoryId: categoryState.receiptCategoryId },
    reviewItems: applyReviewItemsTaxPreview(categoryState.items, {
      ...buildReviewTaxEvidence(draft),
      paidTotalYen: Number(mappedForm.amountYen),
    }),
    persistedReviewItems: items,
    isCategorySplit: categoryState.isCategorySplit,
  };
}

type StoredDialogProps = ReturnType<typeof reviewDialogPropsFromStoredDraft>;

function judgeDialogProps(dialogProps: StoredDialogProps) {
  return judgeReviewFormAmountAndTax(
    { ...dialogProps.selectedReviewDraft, items: dialogProps.persistedReviewItems },
    dialogProps.reviewForm,
    dialogProps.reviewItems,
  );
}

function expectDialogJudgment(
  dialogProps: StoredDialogProps,
  expected: {
    status: "not_applicable" | "resolved" | "unresolved";
    amount?: "matched" | "mismatch" | "uncomparable";
    taxRate?: "matched" | "mismatch" | "uncomparable";
    unresolvedTaxItemCount?: number;
  },
) {
  const judgment = judgeDialogProps(dialogProps);
  expect(judgment.status).toBe(expected.status);
  if (expected.amount) expect(judgment.checks.amount.status).toBe(expected.amount);
  if (expected.taxRate) expect(judgment.checks.taxRate.status).toBe(expected.taxRate);
  if (expected.unresolvedTaxItemCount !== undefined) {
    expect(judgment.unresolvedTaxItemCount).toBe(expected.unresolvedTaxItemCount);
  }
  return judgment;
}

function createStaticProps() {
  return {
    open: true,
    categories: [{ _id: "food", name: "食費", color: "#886644" }],
    isReviewDraftLoading: false,
    isReviewDraftNotFound: false,
    reviewError: "",
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
    onTaxRateChange: vi.fn(),
    onConfirmItemTax: vi.fn(),
    onAmountBasisChange: vi.fn(),
  };
}

function renderStoredDialog(
  dialogProps: StoredDialogProps,
  overrides: Partial<ReviewDialogProps> = {},
) {
  const props = {
    ...createStaticProps(),
    ...dialogProps,
    ...overrides,
  } as ReviewDialogProps;
  return { ...render(<ReviewDialog {...props} />), props };
}

function storedDraft(overrides: Partial<AiExpenseDraft> = {}): AiExpenseDraft {
  return {
    _id: "draft",
    status: "needs_review",
    documentType: "receipt",
    shopName: "ジャパン",
    date: "2026-08-06",
    amountYen: 92,
    categoryId: "food",
    reviewReasons: [],
    ...overrides,
  };
}

function storedItem(
  overrides: Partial<AiExpenseDraftItem> &
    Pick<AiExpenseDraftItem, "_id" | "itemName" | "amountYen">,
): AiExpenseDraftItem {
  return {
    lineType: "item",
    printedAmountYen: overrides.amountYen,
    normalizedAmountYen: overrides.amountYen,
    categoryId: "food",
    ...overrides,
  };
}

function resolvedItem(input: {
  _id: string;
  itemName: string;
  amountYen: number;
  taxRatePercent: 0 | 8 | 10;
  amountBasis?: "tax_included" | "tax_excluded";
  printedAmountYen?: number;
  normalizedAmountYen?: number;
  allocatedTaxYen: number;
  lineType?: "item" | "discount";
  discountTargetItemId?: string;
}): AiExpenseDraftItem {
  return storedItem({
    ...input,
    lineType: input.lineType ?? "item",
    amountBasis: input.amountBasis ?? "tax_included",
    normalizedAmountYen: input.normalizedAmountYen ?? input.amountYen,
    allocatedTaxYen: input.allocatedTaxYen,
    taxAllocationStatus: "allocated",
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
  });
}

function unresolvedDiscountFixture() {
  return {
    draft: storedDraft(),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 116,
        taxRatePercent: 8,
        allocatedTaxYen: 9,
      }),
      storedItem({
        _id: "discount",
        itemName: "割引",
        lineType: "discount",
        amountYen: -24,
      }),
    ],
  };
}

function matchedDiscountFixture() {
  return {
    draft: storedDraft({
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "included",
          taxableAmountYen: 92,
          taxableAmountBasis: "tax_included",
          taxYen: 7,
          roundingMethod: "round",
          warnings: [],
        },
      ],
    }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 116,
        taxRatePercent: 8,
        allocatedTaxYen: 9,
      }),
      resolvedItem({
        _id: "discount",
        itemName: "割引",
        lineType: "discount",
        amountYen: -24,
        taxRatePercent: 8,
        allocatedTaxYen: -2,
        discountTargetItemId: "food",
      }),
    ],
  };
}

function verifiedExternal110TaxSummaries(): NonNullable<AiExpenseDraft["taxSummaries"]> {
  return [
    {
      taxRatePercent: 10,
      taxMode: "external",
      taxableAmountYen: 100,
      taxableAmountBasis: "tax_excluded",
      taxYen: 10,
      roundingMethod: "round",
      status: "verified",
      warnings: [],
    },
  ];
}

function basisMismatchFixture() {
  return {
    draft: storedDraft({ amountYen: 110, taxSummaries: verifiedExternal110TaxSummaries() }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 100,
        taxRatePercent: 10,
        allocatedTaxYen: 9,
      }),
    ],
  };
}

function basisCorrectedFixture() {
  return {
    draft: storedDraft({ amountYen: 110, taxSummaries: verifiedExternal110TaxSummaries() }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 110,
        printedAmountYen: 100,
        taxRatePercent: 10,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 110,
        allocatedTaxYen: 10,
      }),
    ],
  };
}

function unconfirmedTaxFixture() {
  return {
    draft: storedDraft({ amountYen: 116 }),
    items: [
      storedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 116,
        taxRatePercent: 8,
        amountBasis: undefined,
        normalizedAmountYen: undefined,
      }),
    ],
  };
}

function confirmedTaxFixture() {
  return {
    draft: storedDraft({ amountYen: 116 }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 116,
        taxRatePercent: 8,
        allocatedTaxYen: 9,
      }),
    ],
  };
}

function external216Fixture() {
  return {
    draft: storedDraft({
      amountYen: 216,
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
    }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 200,
        taxRatePercent: 8,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 216,
        allocatedTaxYen: 16,
      }),
    ],
  };
}

function mixedTaxStoredFixture(taxSummaries: NonNullable<AiExpenseDraft["taxSummaries"]>) {
  return {
    draft: storedDraft({
      _id: "mixed-tax-draft",
      shopName: "混在税店",
      date: "2026-10-05",
      amountYen: 1782,
      taxSummaries,
      rawObservation: {
        source: "ai_ocr",
        observedAt: 1,
        lines: [
          {
            rawText: "合計 1,782円",
            amountText: "1,782円",
            amountYen: 1782,
            lineRoleCandidates: ["total"],
            roleConfidence: 1,
            explicitlyPrinted: true,
            sourceLineIndex: 0,
          },
        ],
      },
    }),
    items: [95, 1060, 128, 99, 99, 248].map((amount, index) =>
      storedItem({
        _id: `item-${index}`,
        itemName: index === 1 ? "日用品" : `食品${index}`,
        amountYen: amount,
        amountBasis: index === 1 ? "tax_included" : "tax_excluded",
        taxRatePercent: index === 1 ? 10 : 8,
        taxResolutionStatus: "resolved",
        taxResolutionSource: "item_explicit",
        normalizedAmountYen: undefined,
      }),
    ),
  };
}

function amountMatchedReceiptFixture() {
  return {
    draft: storedDraft({
      amountYen: 560,
      reviewReasons: ["low_confidence"],
      rawObservation: {
        source: "ai_ocr",
        observedAt: 1,
        lines: [
          {
            rawText: "合計 560円",
            amountYen: 560,
            amountText: "560",
            lineRoleCandidates: ["total"],
            roleConfidence: 1,
            explicitlyPrinted: true,
            sourceLineIndex: 0,
          },
          {
            rawText: "(8%対象 ¥519 消費税 ¥41)",
            amountYen: 519,
            amountText: "519",
            lineRoleCandidates: ["tax"],
            roleConfidence: 1,
            explicitlyPrinted: true,
            sourceLineIndex: 1,
          },
        ],
      },
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "included",
          taxableAmountYen: 519,
          taxableAmountBasis: "tax_excluded",
          taxYen: 41,
          roundingMethod: "round",
          warnings: [],
        },
      ],
    }),
    items: [
      resolvedItem({
        _id: "a",
        itemName: "商品a",
        amountYen: 183,
        taxRatePercent: 8,
        allocatedTaxYen: 13,
      }),
      resolvedItem({
        _id: "b",
        itemName: "商品b",
        amountYen: 183,
        taxRatePercent: 8,
        allocatedTaxYen: 13,
      }),
      resolvedItem({
        _id: "c",
        itemName: "商品c",
        amountYen: 194,
        taxRatePercent: 8,
        allocatedTaxYen: 15,
      }),
    ],
  };
}

function singleExcludedFixture() {
  return {
    draft: storedDraft({
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
    }),
    items: [
      resolvedItem({
        _id: "a",
        itemName: "商品a",
        amountYen: 100,
        taxRatePercent: 10,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 110,
        allocatedTaxYen: 10,
      }),
    ],
  };
}

function mixedBasisFixture() {
  return {
    draft: storedDraft({ amountYen: 218 }),
    items: [
      resolvedItem({
        _id: "a",
        itemName: "商品a",
        amountYen: 108,
        taxRatePercent: 8,
        allocatedTaxYen: 8,
      }),
      resolvedItem({
        _id: "b",
        itemName: "商品b",
        amountYen: 100,
        taxRatePercent: 10,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 110,
        allocatedTaxYen: 10,
      }),
    ],
  };
}

describe("下書きの修正導線", () => {
  it("本番変換で金額と税率別が一致しても、割引対象の税率差は案内し全体一致を表示しない", () => {
    const common = {
      categoryId: "food",
      amountBasis: "tax_included" as const,
      taxAllocationStatus: "allocated" as const,
      taxResolutionStatus: "resolved" as const,
      taxResolutionSource: "item_explicit" as const,
    };
    const items = [
      { ...common, _id: "a", itemName: "商品A", amountYen: 110, taxRatePercent: 10 as const },
      { ...common, _id: "b", itemName: "商品B", amountYen: 216, taxRatePercent: 8 as const },
      {
        ...common,
        _id: "c",
        itemName: "クーポン",
        lineType: "discount" as const,
        amountYen: -1,
        taxRatePercent: 10 as const,
        discountTargetItemId: "b",
      },
    ].map((item) => storedItem(item));
    const dialogProps = reviewDialogPropsFromStoredDraft(
      storedDraft({
        amountYen: 325,
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
      }),
      items,
    );
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "matched",
      taxRate: "matched",
      unresolvedTaxItemCount: 0,
    });

    renderStoredDialog(dialogProps);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText(/割引の対象税率が対象商品（8%）と異なります/)).toBeVisible();
    expect(within(banner).queryByText(/金額は一致しています/)).not.toBeInTheDocument();
  });

  it("税込扱いで金額不一致の明細を税抜へ直すと、判定が解決し一致表示に変わる", async () => {
    const beforeFixture = basisMismatchFixture();
    const before = reviewDialogPropsFromStoredDraft(beforeFixture.draft, beforeFixture.items);
    expectDialogJudgment(before, {
      status: "unresolved",
      amount: "mismatch",
      taxRate: "uncomparable",
    });
    const afterFixture = basisCorrectedFixture();
    const after = reviewDialogPropsFromStoredDraft(afterFixture.draft, afterFixture.items);
    expectDialogJudgment(after, { status: "resolved", amount: "matched", taxRate: "matched" });

    const onAmountBasisChange = vi.fn();
    const rendered = renderStoredDialog(before, { onAmountBasisChange });
    expect(
      within(screen.getByRole("region", { name: "確認結果" })).getByText("10円"),
    ).toBeVisible();
    const row = screen.getByText("ホットケーキ").closest("details")!;
    if (!row.hasAttribute("open")) await userEvent.click(row.querySelector("summary")!);
    await userEvent.click(within(row).getByRole("combobox", { name: "ホットケーキの表示価格" }));
    await userEvent.click(screen.getByRole("option", { name: "税抜" }));
    expect(onAmountBasisChange).toHaveBeenCalledWith("food", "tax_excluded");

    rendered.rerender(
      <ReviewDialog {...rendered.props} {...after} onAmountBasisChange={onAmountBasisChange} />,
    );
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        "金額は一致しています",
      ),
    ).toBeVisible();
    expect(screen.queryByText("確認結果：計算した金額が一致しています。")).not.toBeInTheDocument();
  });

  it("金額不一致の下書きでは、明示された税込・税抜の根拠だけを表示する", () => {
    const base = basisMismatchFixture();
    const receiptTaxDecision = {
      priceTaxTreatment: "excluded" as const,
      taxRateComposition: "rate8" as const,
      resolutionStatus: "verified" as const,
      resolutionSource: "explicitLabel" as const,
      evidence: ["explicit_label:excluded"],
      reasons: [],
      candidates: [],
      taxAmount: { roundingMethod: "round" as const, source: "unknown" as const },
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(
      { ...base.draft, receiptTaxDecision },
      base.items,
    );
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "mismatch",
      taxRate: "uncomparable",
    });

    const rendered = renderStoredDialog(dialogProps);
    expect(screen.getByText("レシートに「税抜」の表記があります")).toBeVisible();
    // receiptTaxDecision は画面の根拠表示だけに使われ、初期化変換の結果は変わらない。
    rendered.rerender(
      <ReviewDialog
        {...rendered.props}
        selectedReviewDraft={{
          ...dialogProps.selectedReviewDraft,
          receiptTaxDecision: { ...receiptTaxDecision, evidence: [] },
        }}
      />,
    );
    expect(screen.queryByText("レシートに「税抜」の表記があります")).not.toBeInTheDocument();
    rendered.rerender(
      <ReviewDialog
        {...rendered.props}
        selectedReviewDraft={{
          ...dialogProps.selectedReviewDraft,
          receiptTaxDecision: { ...receiptTaxDecision, evidence: ["explicit_label:included"] },
        }}
      />,
    );
    expect(screen.getByText("レシートに「税込」の表記があります")).toBeVisible();
  });

  it.each([
    { label: "カテゴリ未選択", invalid: { categoryId: "" } },
    { label: "金額不正", invalid: { amountYen: "oops" } },
  ])(
    "ユーザーが割引対象を空にし割引行が$labelなら、必須エラーから割引行へ移動する",
    async ({ invalid }) => {
      const fixture = matchedDiscountFixture();
      const initial = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
      expectDialogJudgment(initial, { status: "resolved", amount: "matched", taxRate: "matched" });
      // 本番変換では割引対象が推定されるため、ここではユーザーが対象を空に戻し、さらに入力を壊した状態を使う。
      const editedItems = initial.reviewItems.map((item) =>
        item.id === "discount" ? { ...item, discountTargetItemId: undefined, ...invalid } : item,
      );
      const edited = { ...initial, reviewItems: editedItems };
      expectDialogJudgment(edited, { status: "unresolved" });
      expect(
        validateReviewInput(edited.reviewForm, edited.reviewItems).some((issue) => issue.required),
      ).toBe(true);

      const rendered = renderStoredDialog(edited);
      expect(screen.getByRole("status")).toHaveTextContent("保存前に修正が必要");
      await userEvent.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));
      const discountRow = screen.getByText("割引", { exact: true }).closest("details")!;
      expect(discountRow).toHaveAttribute("open");
      expect(rendered.props.onSubmit).not.toHaveBeenCalled();
    },
  );

  it("税設定が未確認で登録額が決まらない下書きは、理由と確認操作を表示し、読み取り失敗と決めつけない", async () => {
    const user = userEvent.setup();
    const onConfirmItemTax = vi.fn();
    // 商品名を変えて保存したときと同じ状態（税率と税込／税抜は残り、税設定は未確認、未配分）。
    const confirmed: AiExpenseDraftItem = {
      _id: "food",
      itemName: "ホットケーキ",
      amountYen: 116,
      printedAmountYen: 116,
      normalizedAmountYen: 116,
      categoryId: "food",
      amountBasis: "tax_included",
      taxRatePercent: 8,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      taxAllocationStatus: "allocated",
      allocatedTaxYen: 8,
      taxConfirmedFields: ["amountBasis", "taxRatePercent"],
    };
    const stored = invalidateItemTaxRateConfirmation(confirmed);
    const dialogProps = reviewDialogPropsFromStoredDraft(storedDraft({ amountYen: 116 }), [stored]);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "matched",
      unresolvedTaxItemCount: 1,
    });

    renderStoredDialog(dialogProps, { onConfirmItemTax });
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("修正必須 0件"),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("税の確認待ち 1件"),
    ).toBeVisible();
    const row = screen.getByText("ホットケーキ").closest("details")!;
    await user.click(row.querySelector("summary")!);
    expect(within(row).getByRole("combobox", { name: "ホットケーキの税率" })).toHaveTextContent(
      "8%",
    );
    expect(within(row).getByText(/商品名・行の種類が変わっています/)).toBeVisible();
    expect(screen.queryByText(/税内訳を読み取れていません/)).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "この税設定を確認する" }));
    expect(onConfirmItemTax).toHaveBeenCalledExactlyOnceWith("food", 8, "tax_included");
  });

  it("矛盾した税内訳でも登録額と金額が一致すれば、確認案内を出さない", () => {
    const fixture = {
      draft: storedDraft({
        amountYen: 265,
        rawObservation: {
          source: "ai_ocr" as const,
          observedAt: 1,
          lines: [
            {
              rawText: "8%対象額 246円",
              amountYen: 246,
              amountText: "246",
              lineRoleCandidates: ["tax" as const],
              roleConfidence: 1,
              explicitlyPrinted: true,
              sourceLineIndex: 0,
            },
            {
              rawText: "外税8% 20円",
              amountYen: 20,
              amountText: "20",
              lineRoleCandidates: ["tax" as const],
              roleConfidence: 1,
              explicitlyPrinted: true,
              sourceLineIndex: 1,
            },
            {
              rawText: "合計 265円",
              amountYen: 265,
              amountText: "265",
              lineRoleCandidates: ["total" as const],
              roleConfidence: 1,
              explicitlyPrinted: true,
              sourceLineIndex: 2,
            },
          ],
        },
        taxSummaries: [
          {
            taxRatePercent: 8,
            taxMode: "external" as const,
            taxableAmountYen: 246,
            taxableAmountBasis: "tax_excluded" as const,
            taxYen: 19,
            roundingMethod: "floor" as const,
            warnings: ["contradictory_receipt_tax_evidence"],
            status: "contradictory" as const,
          },
        ],
      }),
      items: [108, 138].map((amount, index) =>
        storedItem({
          _id: `item-${index}`,
          itemName: `商品${index}`,
          amountYen: amount,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          taxResolutionStatus: "resolved",
          taxResolutionSource: "item_explicit",
          taxAllocationStatus: "unallocated",
          normalizedAmountYen: undefined,
        }),
      ),
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "uncomparable",
      unresolvedTaxItemCount: 0,
    });

    renderStoredDialog(dialogProps);
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).queryByText("商品の金額を確認してください")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });

  it("低信頼度でも判定が解決し金額一致なら、全体の読み取り確認を重複表示しない", () => {
    const fixture = {
      draft: storedDraft({
        amountYen: 116,
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
      }),
      items: confirmedTaxFixture().items,
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "matched",
    });

    renderStoredDialog(dialogProps);
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).queryByText("レシート全体の確認")).not.toBeInTheDocument();
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(screen.queryByText("確認結果：計算した金額が一致しています。")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });

  it("税設定未確認で金額・税率別とも比較不能なら、両方の状態カードを表示する", () => {
    const fixture = unresolvedDiscountFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
      unresolvedTaxItemCount: 1,
    });

    renderStoredDialog(dialogProps);
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("税率別集計")).toBeVisible();
    expect(within(region).getByText("金額確認")).toBeVisible();
  });

  it("支払額が空で税率別だけ一致なら、金額確認カードだけを表示する", () => {
    const fixture = {
      draft: storedDraft({
        amountYen: undefined,
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
      }),
      items: confirmedTaxFixture().items,
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "matched",
    });

    renderStoredDialog(dialogProps);
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("金額確認")).toBeVisible();
    expect(within(region).queryByText("税率別集計")).not.toBeInTheDocument();
  });

  it("解決済み明細の合計が支払額と24円不一致なら、差額だけを示して商品一覧へ移動できる", async () => {
    const user = userEvent.setup();
    const fixture = {
      draft: storedDraft(),
      items: [
        resolvedItem({
          _id: "food",
          itemName: "ホットケーキ",
          amountYen: 116,
          taxRatePercent: 0,
          allocatedTaxYen: 0,
        }),
      ],
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "mismatch",
      taxRate: "uncomparable",
    });

    renderStoredDialog(dialogProps);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("印字額と明細の金額が一致していません")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "確認結果" })).getByText("24円"),
    ).toBeVisible();
    await user.click(within(banner).getByRole("button", { name: "金額を確認する" }));
    expect(screen.getByRole("region", { name: "確認結果" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "商品一覧" })).toBeVisible();
  });

  it("ユーザーが明細金額を0円にした状態では、修正導線が明細金額欄へフォーカスする", async () => {
    const user = userEvent.setup();
    const fixture = confirmedTaxFixture();
    const initial = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(initial, { status: "resolved", amount: "matched", taxRate: "matched" });
    // 保存済み116円からユーザーが0円へ書き換えた編集後の状態。
    const edited = {
      ...initial,
      reviewItems: initial.reviewItems.map((item) => ({ ...item, amountYen: "0" })),
    };
    expectDialogJudgment(edited, { status: "unresolved", amount: "mismatch" });
    expect(
      validateReviewInput(edited.reviewForm, edited.reviewItems).some(
        (issue) => issue.code === "itemAmount" && issue.required,
      ),
    ).toBe(true);

    renderStoredDialog(edited);
    await user.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));
    expect(screen.getByRole("textbox", { name: "レシートの金額" })).toHaveFocus();
  });

  it("税設定の確認前後で、編集中の商品行は問題が解消しても閉じず再編集できる", async () => {
    const user = userEvent.setup();
    const beforeFixture = unconfirmedTaxFixture();
    const before = reviewDialogPropsFromStoredDraft(beforeFixture.draft, beforeFixture.items);
    expectDialogJudgment(before, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
      unresolvedTaxItemCount: 1,
    });
    const afterFixture = confirmedTaxFixture();
    const after = reviewDialogPropsFromStoredDraft(afterFixture.draft, afterFixture.items);
    expectDialogJudgment(after, { status: "resolved", amount: "matched", taxRate: "matched" });

    const rendered = renderStoredDialog(before);
    const field = screen.getByRole("textbox", { name: "明細名" });
    await user.click(field);
    rendered.rerender(<ReviewDialog {...rendered.props} {...after} />);
    expect(field).toBeVisible();
    expect(field).toHaveFocus();
    await user.type(field, "修正");
    expect(rendered.props.onItemChange).toHaveBeenCalled();
  });

  it("税判定が未解決のまま割引対象だけを空にした状態でも、商品ごとの問題を全体バナーへ重複表示しない", async () => {
    const user = userEvent.setup();
    const fixture = unresolvedDiscountFixture();
    const initial = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(initial, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    // 本番変換では対象が入るため、ユーザーが「割引対象を選択」へ戻した編集後の状態を使う。
    const edited = {
      ...initial,
      reviewItems: initial.reviewItems.map((item) =>
        item.id === "discount" ? { ...item, discountTargetItemId: undefined } : item,
      ),
    };
    expectDialogJudgment(edited, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    expect(validateReviewInput(edited.reviewForm, edited.reviewItems)).toContainEqual(
      expect.objectContaining({ code: "discountTarget", required: false }),
    );

    renderStoredDialog(edited);
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
    const fixture = unresolvedDiscountFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });

    renderStoredDialog(dialogProps, {
      reviewError: "割引対象の商品を選択してください。",
      taxUpdatingItemId: "food",
    });
    expect(screen.getByText(/入力は残っています/)).toBeVisible();
    expect(screen.getByRole("button", { name: "下書きを保存" })).toBeDisabled();
  });

  it("税内訳のない本番変換の下書きでも、永続化済み明細の税率・税込／税抜を修正できる", async () => {
    const user = userEvent.setup();
    const fixture = unresolvedDiscountFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    expect(dialogProps.selectedReviewDraft.taxSummaries).toBeUndefined();

    renderStoredDialog(dialogProps);
    const item = screen.getAllByText("ホットケーキ")[0].closest("details")!;
    if (!item.hasAttribute("open")) await user.click(item.querySelector("summary")!);
    expect(screen.getByRole("combobox", { name: "ホットケーキの税率" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "ホットケーキの表示価格" })).toBeEnabled();
  });

  it("税モデルのない下書きでは、商品行の税未入力を問題表示せず金額一致と判定をそろえる", async () => {
    const user = userEvent.setup();
    const fixture = {
      draft: storedDraft({ amountYen: 100 }),
      items: [storedItem({ _id: "item", itemName: "ホットケーキ", amountYen: 100 })],
    };
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    const judgment = expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "uncomparable",
      unresolvedTaxItemCount: 0,
    });
    expect(judgment.checks.taxRate.blockerCode).toBe("missing-tax-summary");
    expect(dialogProps.selectedReviewDraft.rawObservation).toBeUndefined();
    expect(dialogProps.selectedReviewDraft.taxSummaries).toBeUndefined();

    renderStoredDialog(dialogProps);
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).getByText(
        "金額は一致しています",
      ),
    ).toBeVisible();
    expect(screen.queryByText("要確認")).not.toBeInTheDocument();
    expect(screen.queryByText("未確定")).not.toBeInTheDocument();
    expect(screen.queryByText(/税設定の確認が必要な明細/)).not.toBeInTheDocument();
    expect(screen.queryByText(/税率と税込／税抜が未設定です/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "この税設定を確認する" })).not.toBeInTheDocument();

    const item = screen.getByText("ホットケーキ").closest("details")!;
    if (!item.hasAttribute("open")) await user.click(item.querySelector("summary")!);
    expect(screen.getByRole("combobox", { name: "ホットケーキの税率" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "ホットケーキの表示価格" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "この内容で保存" })).toBeEnabled();
  });

  it("税判定が未解決の下書きで割引対象を空にしても、確認項目を残したまま下書きを保存できる", async () => {
    const user = userEvent.setup();
    const fixture = unresolvedDiscountFixture();
    const initial = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(initial, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    // 本番変換では対象が入るため、ユーザーが空に戻した編集後の状態を使う。
    const edited = {
      ...initial,
      reviewItems: initial.reviewItems.map((item) =>
        item.id === "discount" ? { ...item, discountTargetItemId: undefined } : item,
      ),
    };
    expectDialogJudgment(edited, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    expect(validateReviewInput(edited.reviewForm, edited.reviewItems)).toContainEqual(
      expect.objectContaining({ code: "discountTarget", required: false }),
    );
    expect(
      validateReviewInput(edited.reviewForm, edited.reviewItems).some((issue) => issue.required),
    ).toBe(false);

    const rendered = renderStoredDialog(edited);
    expect(
      within(screen.getByRole("region", { name: "全体の確認状態" })).queryByText(
        /割引対象の商品を選択/,
      ),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));
    expect(rendered.props.onSubmit).toHaveBeenCalledWith(false, "detailed");
  });
});

describe("読込中・不存在の表示", () => {
  it("読込中はフォーム形のSkeletonを表示し、フォームは出さない", () => {
    const fixture = confirmedTaxFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    renderStoredDialog(dialogProps, { isReviewDraftLoading: true });
    expect(screen.getByLabelText("下書きを読み込んでいます")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "店名・内容" })).not.toBeInTheDocument();
  });

  it("不存在のときはAlertから閉じられる", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const fixture = confirmedTaxFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    renderStoredDialog(dialogProps, { isReviewDraftNotFound: true, onClose });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("下書きが見つかりません");
    await user.click(within(alert).getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("保存仕様の説明", () => {
  it("判定未解決でも必須エラーがなければ、冒頭の説明は保存ボタンの文言に一致する", () => {
    const fixture = unresolvedDiscountFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });

    renderStoredDialog(dialogProps);
    const status = screen.getByLabelText("保存状態");
    const saveButton = screen.getByRole("button", { name: "下書きを保存" });
    expect(status).toHaveTextContent(`「${saveButton.textContent}」で下書きに保存されます`);
    expect(status).toHaveTextContent("登録は一覧の「登録する」から行います");
    expect(status).not.toHaveTextContent("変更は下書きに保存されます");
    expect(status).not.toHaveTextContent("変更ごとに下書きへ保存されます");
    expect(status).not.toHaveTextContent("この内容で保存」で保存します");
    expect(screen.getByText("閉じると未保存の入力は失われます。")).toBeInTheDocument();
  });

  it("保存済み店名が空なら、保存ではなく修正導線であることが分かる文言にする", () => {
    const fixture = unresolvedDiscountFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(
      { ...fixture.draft, shopName: undefined },
      fixture.items,
    );
    expectDialogJudgment(dialogProps, {
      status: "unresolved",
      amount: "uncomparable",
      taxRate: "uncomparable",
    });
    expect(
      validateReviewInput(dialogProps.reviewForm, dialogProps.reviewItems).some(
        (issue) => issue.required,
      ),
    ).toBe(true);

    renderStoredDialog(dialogProps);
    const status = screen.getByLabelText("保存状態");
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeInTheDocument();
    expect(status).toHaveTextContent("修正が必要な項目を直すと下書きに保存できます");
    expect(status).toHaveTextContent("登録は一覧の「登録する」から行います");
    expect(status).not.toHaveTextContent("で下書きに保存されます");
  });
});

describe("Issue #892 現在の税内訳に揃えた表示", () => {
  it.each(Object.entries(legacyTaxSummaryVariants()))(
    "本番変換した1782円の混在税（旧形式 %s）は判定解決・金額一致で、原文を確認でき内部値の編集はない",
    async (_caseName, taxSummaries) => {
      const user = userEvent.setup();
      const fixture = mixedTaxStoredFixture(taxSummaries);
      const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
      expectDialogJudgment(dialogProps, {
        status: "resolved",
        amount: "matched",
        taxRate: "matched",
      });

      renderStoredDialog(dialogProps);
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

  it("税抜200円が税込216円と判定解決する下書きでは、画面の登録額も216円になる", async () => {
    const user = userEvent.setup();
    const fixture = external216Fixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "matched",
    });

    renderStoredDialog(dialogProps);
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

it("税内訳を持たないが判定解決する税抜明細では、個別修正した税込登録額を再描画で上書きしない", async () => {
  const user = userEvent.setup();
  const fixture = {
    draft: storedDraft({ amountYen: 110 }),
    items: [
      resolvedItem({
        _id: "food",
        itemName: "ホットケーキ",
        amountYen: 100,
        taxRatePercent: 10,
        amountBasis: "tax_excluded",
        normalizedAmountYen: 110,
        allocatedTaxYen: 10,
      }),
    ],
  };
  const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
  expect(dialogProps.selectedReviewDraft.taxSummaries).toBeUndefined();
  expectDialogJudgment(dialogProps, { status: "resolved", amount: "matched", taxRate: "matched" });

  renderStoredDialog(dialogProps);
  const item = screen.getByText("ホットケーキ").closest("details")!;
  if (!item.hasAttribute("open")) await user.click(item.querySelector("summary")!);
  expect(within(item as HTMLElement).getByText("登録額: 110円（税込）")).toBeInTheDocument();
});

describe("Issue #1563 金額が一致している下書きの表示", () => {
  const ACCESSORY_TEXTS = [
    /レシート全体の確認/,
    /商品の金額を確認してください/,
    /の商品とレシートの照合/,
    /確認推奨/,
    /確認事項があります/,
  ];

  it("A: 判定解決・金額一致なら成功の見出しと商品合計・支払額だけを表示し、確認案内を出さない", () => {
    const fixture = amountMatchedReceiptFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "uncomparable",
    });

    renderStoredDialog(dialogProps);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（3件）")).toBeVisible();
    expect(within(banner).getByText("支払額")).toBeVisible();
    expect(within(banner).getAllByText("560円")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "確認件数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
    for (const text of ACCESSORY_TEXTS) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByText("確認箇所へ")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この内容で保存" })).toBeEnabled();
    expect(screen.getByLabelText("保存状態")).toHaveTextContent(
      "「この内容で保存」で下書きに保存されます",
    );
  });

  it("B: 一致した下書きの商品金額をユーザーが変えると、判定が不一致になり確認件数と案内を出す", () => {
    const fixture = amountMatchedReceiptFixture();
    const initial = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(initial, {
      status: "resolved",
      amount: "matched",
      taxRate: "uncomparable",
    });
    const rendered = renderStoredDialog(initial);

    // ユーザーが商品aを183円から184円へ編集した状態。保存済み明細は元のまま。
    const changed = initial.reviewItems.map((item) =>
      item.id === "a"
        ? { ...item, amountYen: "184", printedAmountYen: 184, normalizedAmountYen: 184 }
        : item,
    );
    const edited = { ...initial, reviewItems: changed };
    expectDialogJudgment(edited, { status: "unresolved", amount: "mismatch" });
    rendered.rerender(<ReviewDialog {...rendered.props} reviewItems={changed} />);

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

  it("C: 金額判定は一致でも保存済み店名が空なら、一致時扱いにせず修正必須と確認件数を出す", () => {
    const fixture = amountMatchedReceiptFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(
      { ...fixture.draft, shopName: undefined },
      fixture.items,
    );
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "uncomparable",
    });
    expect(
      validateReviewInput(dialogProps.reviewForm, dialogProps.reviewItems).some(
        (issue) => issue.required,
      ),
    ).toBe(true);

    renderStoredDialog(dialogProps);
    expect(
      within(screen.getByRole("region", { name: "確認件数" })).getByText("修正必須 1件"),
    ).toBeVisible();
    expect(screen.queryByText("金額は一致しています")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "修正が必要な項目へ" })).toBeInTheDocument();
  });

  it("D: 税抜明細が判定解決・金額一致なら、商品の合計を税込で支払額と同額に示す", () => {
    const fixture = singleExcludedFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "matched",
    });

    renderStoredDialog(dialogProps);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（税込・1件）")).toBeVisible();
    expect(within(banner).getAllByText("110円")).toHaveLength(2);
  });

  it("G: 税込と税抜が混在した判定解決・金額一致の下書きでも、商品の合計は税込で示す", () => {
    const fixture = mixedBasisFixture();
    const dialogProps = reviewDialogPropsFromStoredDraft(fixture.draft, fixture.items);
    expectDialogJudgment(dialogProps, {
      status: "resolved",
      amount: "matched",
      taxRate: "matched",
    });

    renderStoredDialog(dialogProps);
    const banner = screen.getByRole("region", { name: "全体の確認状態" });
    expect(within(banner).getByText("金額は一致しています")).toBeVisible();
    expect(within(banner).getByText("商品の合計（税込・2件）")).toBeVisible();
    expect(within(banner).getAllByText("218円")).toHaveLength(2);
  });
});
