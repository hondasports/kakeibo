import type { AiExpenseDraft, ReviewFormValues, ReviewItemValues } from "../types/types";

export function mixedTaxReviewFixture(): {
  draft: AiExpenseDraft;
  form: ReviewFormValues;
  items: ReviewItemValues[];
} {
  return {
    draft: {
      _id: "mixed-tax-draft",
      status: "needs_review",
      documentType: "receipt",
      reviewReasons: [],
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountYen: 669,
          taxableAmountBasis: "unknown",
          taxYen: 53,
          roundingMethod: "floor",
          status: "ambiguous",
          reasons: ["unresolved_tax_summary"],
          warnings: [],
        },
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountYen: 1060,
          taxableAmountBasis: "tax_included",
          taxYen: 96,
          roundingMethod: "floor",
          status: "verified",
          reasons: [],
          warnings: [],
        },
      ],
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
    },
    form: {
      documentType: "receipt",
      shopName: "混在税店",
      date: "2026-10-05",
      amountYen: "1782",
      categoryId: "food",
      registrationMode: "detailed",
      priceTaxTreatment: "perItem",
      taxRateComposition: "mixed",
    },
    items: [95, 1060, 128, 99, 99, 248].map((amount, index) => ({
      id: `item-${index}`,
      itemName: index === 1 ? "日用品" : `食品${index}`,
      amountYen: String(amount),
      printedAmountYen: amount,
      categoryId: "food",
      amountBasis: index === 1 ? "tax_included" : "tax_excluded",
      taxRatePercent: index === 1 ? 10 : 8,
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
    })),
  };
}
