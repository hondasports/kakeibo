import { describe, expect, it } from "vitest";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { buildDraftListSummary } from "./listSummary";
import { isAmountAndTaxResolved } from "./reviewJudgment";
import type { AiExpenseDraftItem } from "./reviewTypes";
import { mixedTaxReviewFixture } from "./reviewTaxPreviewTestHelpers";

function fixtureFields(overrides: Partial<AiExpenseDraftFields> = {}): {
  draft: AiExpenseDraftFields;
  items: AiExpenseDraftItemFields[];
} {
  const { draft, items } = mixedTaxReviewFixture();
  const fields: AiExpenseDraftFields = {
    id: draft._id,
    groupId: "group-1",
    sourceType: "image_upload",
    status: draft.status,
    documentType: draft.documentType,
    amountYen: 1782,
    categoryId: "food",
    taxSummaries: draft.taxSummaries?.map((summary) => ({ ...summary, confidence: {} })),
    rawObservation: draft.rawObservation,
    confidence: {},
    reviewReasons: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
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
    confidence: {},
    createdAt: 0,
    updatedAt: 0,
  }));
  return { draft: fields, items: itemFields };
}

describe("buildDraftListSummary", () => {
  it("金額・税内訳が解決済みなら amountAndTaxResolved=true と itemSummary を返す", () => {
    const { draft, items } = fixtureFields();

    expect(buildDraftListSummary(draft, items)).toEqual({
      amountAndTaxResolved: true,
      itemSummary: {
        itemTotalYen: 1729,
        itemDifferenceYen: 53,
        hasUncategorizedItems: false,
        hasLowConfidenceItems: false,
        categoryAggregates: [{ categoryId: "food", amountYen: 1729 }],
      },
    });
  });

  it("判定結果は下書き確認画面と同じ isAmountAndTaxResolved を通して一致する", () => {
    const { draft, items } = fixtureFields();
    const reviewDraft = {
      ...draft,
      items: items.map(({ id, ...rest }) => ({ ...rest, _id: id }) as AiExpenseDraftItem),
    };

    expect(buildDraftListSummary(draft, items).amountAndTaxResolved).toBe(
      isAmountAndTaxResolved(reviewDraft),
    );
    expect(isAmountAndTaxResolved(reviewDraft)).toBe(true);
  });

  it("税率衝突などの真の不一致は未解決になる", () => {
    const { draft, items } = fixtureFields();
    draft.taxSummaries = draft.taxSummaries?.map((summary) =>
      summary.taxRatePercent === 10
        ? { ...summary, taxableAmountBasis: "tax_excluded", status: "contradictory" }
        : summary,
    );
    draft.rawObservation!.lines.push({
      rawText: "10%税抜対象1060円",
      amountYen: 1060,
      amountText: "1060",
      sourceLineIndex: 3,
      lineRoleCandidates: ["tax"],
      roleConfidence: 1,
      explicitlyPrinted: true,
    });

    expect(buildDraftListSummary(draft, items).amountAndTaxResolved).toBe(false);
  });

  it("明細が無い下書きは未解決で itemSummary を持たない", () => {
    const { draft } = fixtureFields();
    expect(buildDraftListSummary(draft, [])).toEqual({
      amountAndTaxResolved: false,
      itemSummary: undefined,
    });
  });
});
