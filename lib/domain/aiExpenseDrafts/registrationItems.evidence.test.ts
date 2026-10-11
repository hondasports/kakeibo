import { expect, it } from "vitest";
import { buildDraftRegistrationItems } from "./registrationItems";
import { planDraftTaxInterpretation } from "./taxInterpretationPlan";
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
import {
  unprovenTargetReceipt,
  observationLine,
} from "../receipt/tax/fixtures/unprovenTargetReceipt";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";

function fixture() {
  const input = unprovenTargetReceipt();
  const draft: AiExpenseDraftFields & { amountYen: number } = {
    groupId: "group",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "匿名店",
    date: "2026-10-11",
    amountYen: input.amountYen,
    categoryId: "category",
    taxSummaries: input.taxSummaries,
    receiptTotalResolution: {
      status: "verified",
      protectedAmountYen: input.amountYen,
      candidates: [{ amountYen: input.amountYen, source: "explicit_label", evidence: "OCR合計行" }],
      reasons: [],
    },
    rawObservation: { source: "ai_ocr", observedAt: 0, lines: input.rawObservationLines! },
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    reviewReasons: ["amount_mismatch"],
    warnings: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const items = input.items.map((item, index) => ({
    ...item,
    id: `item-${index}`,
    groupId: "group",
    draftId: "draft",
    categoryId: "category",
    amountYen: item.printedAmountYen!,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  return { input, draft, items };
}

it("プレビュー・保存計画・再表示・登録で同じ対象額と税額を使う", () => {
  const { input, draft, items } = fixture();
  const preview = reinterpretDraftTax(input);
  const plan = planDraftTaxInterpretation(draft, items, {}, 1);
  expect(plan.draftPatch.taxSummaries).toEqual(preview.interpretation.taxSummaries);
  expect(plan.draftPatch.status).toBe("ready");
  const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  const savedDraft = { ...draft, ...plan.draftPatch };
  expect(buildDraftRegistrationItems(savedDraft, savedItems)).toEqual([
    { itemName: "商品1、商品2、商品3、商品4、商品5", amountYen: 4810, categoryId: "category" },
  ]);
  expect(planDraftTaxInterpretation(savedDraft, savedItems, {}, 2).draftPatch.taxSummaries).toEqual(
    plan.draftPatch.taxSummaries,
  );
});

it.each(["missing", "stale"])(
  "税内訳の原文がない%sサマリは全体税設定で保存・再表示・登録できる",
  (kind) => {
    const { draft, items } = fixture();
    draft.rawObservation!.lines = [
      { ...observationLine("商品1 990円", 990, 0), lineRoleCandidates: ["item"] },
      { ...observationLine("合計 4,810円", 4810, 1), lineRoleCandidates: ["total"] },
    ];
    if (kind === "missing") draft.taxSummaries = [];
    else draft.taxSummaries![0].taxRatePercent = 8;
    const plan = planDraftTaxInterpretation(
      draft,
      items,
      {
        decisionOverride: { priceTaxTreatment: "included", taxRateComposition: "rate10" },
      },
      1,
    );
    expect(plan.draftPatch.status).toBe("ready");
    const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
    const savedDraft = { ...draft, ...plan.draftPatch };
    expect(buildDraftRegistrationItems(savedDraft, savedItems)).toEqual([
      { itemName: "商品1、商品2、商品3、商品4、商品5", amountYen: 4810, categoryId: "category" },
    ]);
    expect(
      planDraftTaxInterpretation(savedDraft, savedItems, {}, 2).draftPatch.taxSummaries,
    ).toEqual(plan.draftPatch.taxSummaries);
  },
);

it.each(["target", "tax-mode", "subtotal", "missing-raw"])(
  "印字矛盾・根拠不足 %s は登録ガードを通らない",
  (kind) => {
    const { draft, items } = fixture();
    if (kind === "target")
      draft.rawObservation!.lines.push(observationLine("10%税込 4,373円", 4373, 2));
    if (kind === "tax-mode") draft.rawObservation!.lines[1].rawText = "外税10% 437円";
    if (kind === "subtotal")
      draft.rawObservation!.lines.push(observationLine("小計 4,373円", 4373, 2));
    if (kind === "missing-raw") draft.rawObservation = undefined;
    const plan = planDraftTaxInterpretation(draft, items, {}, 1);
    expect(plan.draftPatch.status).toBe("needs_review");
    const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
    expect(() => buildDraftRegistrationItems({ ...draft, ...plan.draftPatch }, savedItems)).toThrow(
      /税額または税込登録額が未確定/,
    );
  },
);

it.each(["classified", "ambiguous"] as const)(
  "%s な決済行では保存・登録時にも税額を確定しない",
  (status) => {
    const { draft, items } = fixture();
    draft.rawObservation!.lines[1].rawText = "カード決済 消費税額437円";
    draft.receiptInterpretation = {
      source: "ai",
      interpretedAt: 0,
      values: {
        status: draft.status,
        documentType: draft.documentType,
        confidence: draft.confidence,
        warnings: [],
        reviewReasons: [],
        items: [],
        receiptLineClassifications: [
          {
            sourceLineIndex: 1,
            status,
            candidates:
              status === "ambiguous"
                ? [
                    { role: "tax", score: 0.5, evidence: [] },
                    { role: "paymentMethodAmount", score: 0.5, evidence: [] },
                  ]
                : [{ role: "paymentMethodAmount", score: 1, evidence: [] }],
          },
        ],
      },
    };
    const plan = planDraftTaxInterpretation(draft, items, {}, 1);
    expect(plan.draftPatch.status).toBe("needs_review");
    expect(plan.draftPatch.taxSummaries![0].taxableAmountYen).toBe(4373);
    expect(() => buildDraftRegistrationItems(draft, items)).toThrow(/税額または税込登録額が未確定/);
  },
);
