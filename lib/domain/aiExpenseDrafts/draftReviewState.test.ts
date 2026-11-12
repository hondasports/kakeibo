import { describe, expect, it } from "vitest";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { buildDraftReviewState } from "./draftReviewState";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { deriveTaxReviewReasons, mapDraftItemToTaxFields } from "../receipt/tax/draftTaxMapping";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";

const draft: AiExpenseDraftFields = {
  id: "d",
  groupId: "g",
  sourceType: "image_upload",
  status: "needs_review",
  documentType: "receipt",
  shopName: "店",
  date: "2026-11-01",
  amountYen: 100,
  categoryId: "food",
  confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
  warnings: [],
  reviewReasons: ["user_confirmation_required"],
  taxSummaries: [
    {
      taxRatePercent: 10,
      taxMode: "included",
      taxableAmountYen: 100,
      taxableAmountBasis: "tax_included",
      taxYen: 9,
      roundingMethod: "unknown",
      status: "verified",
      confidence: {},
      warnings: [],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};
const item = (
  index: number,
  overrides: Partial<AiExpenseDraftItemFields> = {},
): AiExpenseDraftItemFields => ({
  id: `i${index}`,
  groupId: "g",
  draftId: "d",
  itemName: "商品",
  amountYen: 1,
  printedAmountYen: 1,
  normalizedAmountYen: 1,
  amountBasis: "tax_included",
  taxRatePercent: 10,
  taxAllocationStatus: "allocated",
  taxResolutionStatus: "resolved",
  taxResolutionSource: "item_explicit",
  categoryId: "food",
  confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe("100件を超える下書きの税理由", () => {
  it.each([100, 101])("明細%s件すべての合計が支払額と一致すれば保存状態も解決済み", (count) => {
    const items = Array.from({ length: count }, (_, i) =>
      item(i, {
        amountBasis: undefined,
        taxRatePercent: undefined,
        taxAllocationStatus: undefined,
        taxResolutionStatus: undefined,
        taxResolutionSource: undefined,
      }),
    );
    const input = { ...draft, amountYen: count, taxSummaries: [], reviewReasons: [] };
    const state = buildDraftReviewState(input, items, { reasons: [] });
    expect(state.status).toBe("ready");
    expect(state.reviewReasons).toEqual([]);
    expect(state.listSummary).toMatchObject({
      amountAndTaxResolved: true,
      itemSummary: { itemTotalYen: count, itemDifferenceYen: 0 },
    });
    if (count === 100) {
      const windowInput = { ...input, items: items.map((row) => ({ ...row, _id: row.id })) };
      expect(state.judgment).toEqual(judgeDraftAmountAndTax(windowInput));
    }
  });
  it("窓外に未確定税がある場合は金額が全件一致しても確認理由を残す", () => {
    const items = [
      ...Array.from({ length: 100 }, (_, i) => item(i)),
      item(100, {
        taxRatePercent: null,
        amountBasis: "unknown",
        taxResolutionStatus: "unresolved",
        taxAllocationStatus: "unallocated",
        taxResolutionSource: undefined,
      }),
      item(101, {
        itemName: "値引",
        lineType: "discount",
        amountYen: -1,
        printedAmountYen: -1,
        normalizedAmountYen: -1,
      }),
    ];
    const input = { ...draft, items: items.map((row) => ({ ...row, _id: row.id })) };
    expect(judgeDraftAmountAndTax(input).status).toBe("resolved");
    expect(judgeDraftAmountAndTax(input, { itemScope: "all_items" })).toMatchObject({
      status: "unresolved",
      reasons: expect.arrayContaining(["user_confirmation_required"]),
    });
    const oldPathInterpretation = reinterpretDraftTax({
      amountYen: 100,
      taxSummaries: draft.taxSummaries!,
      items: items.map(mapDraftItemToTaxFields),
    }).interpretation;
    expect(deriveTaxReviewReasons(oldPathInterpretation)).toContain("user_confirmation_required");
    const state = buildDraftReviewState(draft, items, { reasons: draft.reviewReasons });
    expect(state.status).toBe("needs_review");
    expect(state.reviewReasons).toContain("user_confirmation_required");
    const confirmed = items.map((row, index) => (index === 100 ? item(100) : row));
    const resolved = buildDraftReviewState(draft, confirmed, { reasons: draft.reviewReasons });
    expect(resolved.status).toBe("ready");
    expect(resolved.reviewReasons).not.toContain("user_confirmation_required");
    const totalOnly = buildDraftReviewState({ ...draft, registrationMode: "totalOnly" }, items, {
      reasons: [],
    });
    expect(totalOnly.status).toBe("ready");
    const migration = buildDraftReviewState(draft, items, {
      reasons: draft.reviewReasons,
      mode: "migration",
    });
    expect(migration.status).toBe("needs_review");
    expect(migration.reviewReasons).toEqual(draft.reviewReasons);
  });
});
