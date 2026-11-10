import { describe, expect, it } from "vitest";
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { buildDraftListSummary } from "./listSummary";
import { buildDraftRegistrationItems } from "./registrationItems";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { buildReviewChecks, countActionableUncomparable } from "./reviewChecks";
import { mapDraftItemsToReviewItems, mapDraftToReviewForm } from "./reviewDraftMapping";
import { getReviewGuidance } from "./reviewGuidance";
import { buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { isAmountAndTaxResolved, isUnrelatedToAmountTaxGuidanceId } from "./reviewJudgment";
import { initializeReviewCategoryState } from "./reviewItemCategories";
import type { AiExpenseDraftItem, AiExpenseDraftJudgmentInput } from "./reviewTypes";
import { legacyTaxSummaryVariants, mixedTaxReviewFixture } from "./reviewTaxPreviewTestHelpers";
import { planDraftTaxInterpretation } from "./taxInterpretationPlan";

/** 商品の税設定から独立に導かれるべき税内訳（保存値の写しではない） */
const expectedDerivedSummaries = [
  {
    taxRatePercent: 8,
    taxMode: "external",
    taxableAmountYen: 669,
    taxableAmountBasis: "tax_excluded",
    taxYen: 53,
    taxIncludedAmountYen: 722,
    status: "verified",
  },
  {
    taxRatePercent: 10,
    taxMode: "included",
    taxableAmountYen: 1060,
    taxableAmountBasis: "tax_included",
    taxYen: 96,
    status: "verified",
  },
];

function fixtureFor(taxSummaries: AiExpenseDraftFields["taxSummaries"]): {
  draftFields: AiExpenseDraftFields;
  itemFields: AiExpenseDraftItemFields[];
  reviewDraft: AiExpenseDraftJudgmentInput;
} {
  const { draft, items } = mixedTaxReviewFixture();
  const itemFields: AiExpenseDraftItemFields[] = items.map((item) => ({
    id: item.id,
    groupId: "group-1",
    draftId: draft._id,
    itemName: item.itemName,
    amountYen: Number(item.amountYen),
    printedAmountYen: item.printedAmountYen,
    amountBasis: item.amountBasis,
    taxRatePercent: item.taxRatePercent,
    taxResolutionStatus: item.taxResolutionStatus,
    taxResolutionSource: item.taxResolutionSource,
    categoryId: item.categoryId,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  const draftFields: AiExpenseDraftFields = {
    id: draft._id,
    groupId: "group-1",
    createdByUserId: "user-1",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "E2E税内訳補完店",
    date: "2026-10-05",
    amountYen: 1782,
    categoryId: "food",
    taxSummaries,
    rawObservation: draft.rawObservation,
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    reviewReasons: ["user_confirmation_required", "amount_mismatch"],
    createdAt: 0,
    updatedAt: 0,
  };
  const reviewDraft: AiExpenseDraftJudgmentInput = {
    ...draftFields,
    items: itemFields.map(({ id, ...rest }) => ({ ...rest, _id: id }) as AiExpenseDraftItem),
  };
  return { draftFields, itemFields, reviewDraft };
}

describe("旧形式の税内訳5パターンの解決（Issue #1015 / #1125）", () => {
  it.each(Object.entries(legacyTaxSummaryVariants()))(
    "%s は商品の税設定から導いた内訳で解決済みになる",
    (_caseName, variant) => {
      const taxSummaries = variant.map((summary) => ({ ...summary, confidence: {} }));
      const { draftFields, itemFields, reviewDraft } = fixtureFor(taxSummaries);

      // 一覧の「金額・税内訳の確認が必要」を出すかどうかの判定（queue 表示の正本）
      expect(isAmountAndTaxResolved(reviewDraft)).toBe(true);
      expect(buildDraftListSummary(draftFields, itemFields).amountAndTaxResolved).toBe(true);

      // ダイアログと同じ再解釈で、保存値ではなく商品から内訳を導く
      const form = mapDraftToReviewForm(reviewDraft);
      const categoryState = initializeReviewCategoryState(
        mapDraftItemsToReviewItems(reviewDraft.items ?? []),
        form.categoryId,
      );
      const preview = buildReviewTaxPreview(categoryState.items, {
        paidTotalYen: 1782,
        taxSummaries: draftFields.taxSummaries,
        rawObservation: draftFields.rawObservation,
        priceTaxTreatment: form.priceTaxTreatment,
        taxRateComposition: form.taxRateComposition,
      });
      expect(preview.taxSummaries).toMatchObject(expectedDerivedSummaries);
      expect(preview.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
      expect(preview.items.reduce((sum, item) => sum + (item.normalizedAmountYen ?? 0), 0)).toBe(
        1782,
      );

      // 「確認推奨 0件」＋「印字額と明細の金額が一致しています」の根拠
      const checks = buildReviewChecks({
        items: preview.items,
        paidTotalYen: 1782,
        taxSummaries: preview.taxSummaries,
        rawObservation: draftFields.rawObservation,
      });
      expect(checks.amount.status).toBe("matched");
      expect(checks.taxRate.status).toBe("matched");
      expect(countActionableUncomparable(checks)).toBe(0);
      const guidance = getReviewGuidance(form, preview.items, {
        ...reviewDraft,
        taxSummaries: preview.taxSummaries,
      });
      expect(guidance.every((issue) => isUnrelatedToAmountTaxGuidanceId(issue.id))).toBe(true);
      expect(guidance.filter((issue) => issue.scope !== "receipt")).toEqual([]);

      // 「この内容で保存」→ ready へ遷移し、保存される内訳も商品由来になる
      const plan = planDraftTaxInterpretation(
        { ...draftFields, amountYen: 1782 },
        itemFields,
        { receiptTotalSource: "user_confirmed" },
        0,
      );
      expect(plan.draftPatch.status).toBe("ready");
      expect(plan.draftPatch.taxSummaries).toMatchObject(expectedDerivedSummaries);

      // 保存パッチ適用後の登録額は 1782円
      const savedDraft = { ...draftFields, ...plan.draftPatch };
      const savedItems = itemFields.map((item) => {
        const patch = plan.itemPatches.find(({ itemId }) => itemId === item.id)?.patch;
        return patch ? { ...item, ...patch } : item;
      });
      const registrationItems = buildDraftRegistrationItems(savedDraft, savedItems);
      expect(registrationItems).toHaveLength(1);
      expect(registrationItems[0]).toMatchObject({ categoryId: "food", amountYen: 1782 });
    },
  );
});

/** 税込10%の3明細レシート。2行目の品名と行種別だけを変える。 */
function discountReceiptFixture(discount: { itemName: string; lineType: ReceiptItemLineType }) {
  const lines: Array<{
    id: string;
    itemName: string;
    lineType: ReceiptItemLineType;
    amountYen: number;
    allocatedTaxYen: number;
  }> = [
    { id: "item-1", itemName: "商品A", lineType: "item", amountYen: 179, allocatedTaxYen: 16 },
    { id: "item-2", ...discount, amountYen: -14, allocatedTaxYen: -1 },
    { id: "item-3", itemName: "商品B", lineType: "item", amountYen: 438, allocatedTaxYen: 39 },
  ];
  const itemFields: AiExpenseDraftItemFields[] = lines.map((line) => ({
    id: line.id,
    groupId: "group-1",
    draftId: "draft-1",
    itemName: line.itemName,
    lineType: line.lineType,
    amountYen: line.amountYen,
    printedAmountYen: line.amountYen,
    normalizedAmountYen: line.amountYen,
    amountBasis: "tax_included",
    taxRatePercent: 10,
    allocatedTaxYen: line.allocatedTaxYen,
    taxAllocationStatus: "allocated",
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
    categoryId: "daily",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  const draftFields: AiExpenseDraftFields = {
    id: "draft-1",
    groupId: "group-1",
    createdByUserId: "user-1",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "店",
    date: "2026-11-08",
    amountYen: 603,
    categoryId: "daily",
    taxSummaries: [
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountYen: 603,
        taxableAmountBasis: "tax_included",
        taxYen: 54,
        taxIncludedAmountYen: 603,
        roundingMethod: "unknown",
        status: "verified",
        confidence: {},
        warnings: [],
      },
    ],
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    reviewReasons: ["user_confirmation_required"],
    createdAt: 0,
    updatedAt: 0,
  };
  const reviewDraft: AiExpenseDraftJudgmentInput = {
    ...draftFields,
    items: itemFields.map(({ id, ...rest }) => ({ ...rest, _id: id }) as AiExpenseDraftItem),
  };
  return { draftFields, itemFields, reviewDraft };
}

describe("一覧・確認画面で金額・税内訳が解決済みの下書きは、保存しても金額の理由で確認待ちに残らず、登録できる（#1229）", () => {
  const cases: Array<[string, ReturnType<typeof discountReceiptFixture>]> = [
    [
      "品名に割引の語が無い割引行（特売）",
      discountReceiptFixture({ itemName: "特売", lineType: "discount" }),
    ],
    [
      "品名に割引の語がある割引行（値引）",
      discountReceiptFixture({ itemName: "値引", lineType: "discount" }),
    ],
    [
      "品名に割引の語が無い販促の調整行（まとめ割）",
      discountReceiptFixture({ itemName: "まとめ割", lineType: "promotion_adjustment" }),
    ],
    ...Object.entries(legacyTaxSummaryVariants()).map(
      ([caseName, variant]): [string, ReturnType<typeof discountReceiptFixture>] => [
        `混在税率の旧形式の税内訳（${caseName}）`,
        fixtureFor(variant.map((summary) => ({ ...summary, confidence: {} }))),
      ],
    ),
  ];

  it.each(cases)("%s", (_caseName, { draftFields, itemFields, reviewDraft }) => {
    expect(isAmountAndTaxResolved(reviewDraft)).toBe(true);

    const plan = planDraftTaxInterpretation(
      { ...draftFields, amountYen: draftFields.amountYen! },
      itemFields,
      { receiptTotalSource: "user_confirmed" },
      0,
    );

    expect(plan.draftPatch.reviewReasons).not.toContain("amount_mismatch");
    expect(plan.draftPatch.status).toBe("ready");

    const savedDraft = { ...draftFields, ...plan.draftPatch };
    const savedItems = itemFields.map((item) => {
      const patch = plan.itemPatches.find(({ itemId }) => itemId === item.id)?.patch;
      return patch ? { ...item, ...patch } : item;
    });
    expect(
      judgeDraftAmountAndTax({
        ...savedDraft,
        items: savedItems.map((item) => ({ ...item, _id: item.id })),
      }),
    ).toMatchObject({ status: "resolved" });
    const registrationItems = buildDraftRegistrationItems(savedDraft, savedItems);
    expect(registrationItems.reduce((sum, item) => sum + item.amountYen, 0)).toBe(
      draftFields.amountYen,
    );
  });
});
