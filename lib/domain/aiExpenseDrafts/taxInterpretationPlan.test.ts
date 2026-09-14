import { describe, expect, it } from "vitest";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import {
  getTaxInterpretationEligibilityErrorMessage,
  planDraftTaxInterpretation,
  resolveReceiptTotalSource,
  resolveReceiptTotalSupportingCandidates,
  validateTaxInterpretationEligibility,
} from "./taxInterpretationPlan";

function makeDraft(overrides: Partial<AiExpenseDraftFields> = {}): AiExpenseDraftFields {
  return {
    groupId: "g1",
    createdByUserId: "u1",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "店",
    date: "2026-07-04",
    amountYen: 108,
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "included",
        taxableAmountYen: 100,
        taxableAmountBasis: "tax_excluded",
        taxYen: 8,
        taxIncludedAmountYen: 108,
        roundingMethod: "floor",
        confidence: {},
        warnings: [],
      },
    ],
    categoryId: "c1",
    confidence: { amountYen: 1 },
    warnings: [],
    reviewReasons: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as AiExpenseDraftFields;
}

function makeItem(
  overrides: Partial<AiExpenseDraftItemFields> = {},
): AiExpenseDraftItemFields & { id: string } {
  return {
    id: "i1",
    groupId: "g1",
    draftId: "d1",
    itemName: "商品",
    amountYen: 108,
    categoryId: "c1",
    confidence: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("validateTaxInterpretationEligibility", () => {
  it("不在→他グループ→欠落の順で判定する", () => {
    expect(validateTaxInterpretationEligibility(null, "g1", undefined)).toEqual({
      success: false,
      error: "not_found",
    });
    expect(
      validateTaxInterpretationEligibility(makeDraft({ groupId: "g2" }), "g1", undefined),
    ).toEqual({ success: false, error: "wrong_group" });
    expect(
      validateTaxInterpretationEligibility(makeDraft({ amountYen: undefined }), "g1", undefined),
    ).toEqual({ success: false, error: "missing_amount_or_summaries" });
    expect(
      validateTaxInterpretationEligibility(makeDraft({ taxSummaries: [] }), "g1", undefined),
    ).toEqual({ success: false, error: "missing_amount_or_summaries" });
  });
  it("decisionOverride があれば税サマリ無しでも許可する", () => {
    const r = validateTaxInterpretationEligibility(makeDraft({ taxSummaries: [] }), "g1", {
      priceTaxTreatment: "included",
    });
    expect(r.success).toBe(true);
  });
  it("文言が既存と一致する", () => {
    expect(getTaxInterpretationEligibilityErrorMessage("not_found")).toBe(
      "AI expense draft not found",
    );
    expect(getTaxInterpretationEligibilityErrorMessage("wrong_group")).toBe(
      "AI expense draft does not belong to the current group",
    );
    expect(getTaxInterpretationEligibilityErrorMessage("missing_amount_or_summaries")).toBe(
      "Tax reinterpretation requires draft amount and tax summaries",
    );
  });
});

describe("resolveReceiptTotalSource / SupportingCandidates", () => {
  const draft = makeDraft({
    amountYen: 108,
    receiptTotalResolution: {
      candidates: [
        { source: "tax_summary_total", amountYen: 108 },
        { source: "explicit_label", amountYen: 108 },
        { source: "tax_arithmetic", amountYen: 100 },
      ],
    } as never,
  });
  it("amountYen 一致の候補 source を採用する（先頭一致は3値外なら ai_estimate）", () => {
    expect(resolveReceiptTotalSource(draft)).toBe("ai_estimate");
    expect(
      resolveReceiptTotalSource({
        amountYen: 108,
        receiptTotalResolution: {
          candidates: [{ source: "user_confirmed", amountYen: 108 }],
        } as never,
      }),
    ).toBe("user_confirmed");
    expect(resolveReceiptTotalSource({ amountYen: 1, receiptTotalResolution: undefined })).toBe(
      "ai_estimate",
    );
  });
  it("tax_summary_total / tax_arithmetic を裏付けから除外する", () => {
    expect(resolveReceiptTotalSupportingCandidates(draft)).toEqual([
      { source: "explicit_label", amountYen: 108 },
    ]);
  });
});

describe("planDraftTaxInterpretation", () => {
  it("明細patch・下書きpatchを算出し updatedAt を now にする", () => {
    const draft = makeDraft() as AiExpenseDraftFields & { amountYen: number };
    const plan = planDraftTaxInterpretation(draft, [makeItem()], {}, 999);
    expect(plan.itemPatches).toHaveLength(1);
    expect(plan.itemPatches[0].itemId).toBe("i1");
    expect(plan.itemPatches[0].patch.updatedAt).toBe(999);
    expect(plan.itemPatches[0].patch.printedAmountYen).toBe(108);
    expect(plan.draftPatch.updatedAt).toBe(999);
    expect(["ready", "needs_review"]).toContain(plan.draftPatch.status);
    expect(Array.isArray(plan.draftPatch.warnings)).toBe(true);
  });

  it("明細の既存 printedAmountYen を優先する", () => {
    const draft = makeDraft() as AiExpenseDraftFields & { amountYen: number };
    const plan = planDraftTaxInterpretation(draft, [makeItem({ printedAmountYen: 55 })], {}, 1);
    expect(plan.itemPatches[0].patch.printedAmountYen).toBe(55);
  });

  it("totalOnly は税レビュー理由を付けない", () => {
    const draft = makeDraft({ registrationMode: "totalOnly" }) as AiExpenseDraftFields & {
      amountYen: number;
    };
    const plan = planDraftTaxInterpretation(draft, [makeItem()], {}, 1);
    expect(plan.draftPatch.reviewReasons.some((r) => String(r).startsWith("tax_"))).toBe(false);
  });

  it("preservedNonTaxReasons は下書きの理由へ引き継がれる", () => {
    const draft = makeDraft() as AiExpenseDraftFields & { amountYen: number };
    const plan = planDraftTaxInterpretation(
      draft,
      [makeItem()],
      { preservedNonTaxReasons: ["user_confirmation_required"] },
      1,
    );
    expect(plan.draftPatch.reviewReasons).toContain("user_confirmation_required");
    expect(plan.draftPatch.status).toBe("needs_review");
  });
});
