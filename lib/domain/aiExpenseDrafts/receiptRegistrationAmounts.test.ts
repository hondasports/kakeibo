import { describe, expect, it } from "vitest";
import type { ReceiptRawObservationLine } from "../receipt/observations";
import { observationLine } from "../receipt/tax/fixtures/unprovenTargetReceipt";
import type { TaxRatePercent } from "../receipt/tax/types";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { buildDraftRegistrationItems } from "./registrationItems";
import { RECEIPT_DATA_CONTRACT_VERSION } from "./receiptDataContract";
import { judgeReviewFormAmountAndTax } from "./reviewFormJudgment";
import { getReviewGuidance } from "./reviewGuidance";
import { buildReviewTaxEvidence, buildReviewTaxPreview } from "./reviewItemsTaxPreview";
import { mapDraftItemsToReviewItems, mapDraftToReviewForm } from "./reviewDraftMapping";
import { planDraftTaxInterpretation } from "./taxInterpretationPlan";

function receipt(
  amounts: number[],
  paid: number,
  basis: "tax_included" | "tax_excluded",
  rates: TaxRatePercent[],
) {
  const draft = {
    id: "draft",
    groupId: "group",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "店",
    date: "2026-11-22",
    amountYen: paid,
    categoryId: "food",
    confidence: { amountYen: 1, shopName: 1, date: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
    reviewReasons: [],
    warnings: [],
    rawObservation: {
      source: "ai_ocr",
      observedAt: 0,
      lines: [
        { ...observationLine(`お支払合計 ${paid}円`, paid, 0), lineRoleCandidates: ["total"] },
      ] as ReceiptRawObservationLine[],
    },
  } satisfies AiExpenseDraftFields & { amountYen: number };
  const items: (AiExpenseDraftItemFields & { id: string })[] = amounts.map((amountYen, index) => ({
    id: `item-${index}`,
    draftId: draft.id,
    groupId: draft.groupId,
    itemName: `商品${index + 1}`,
    lineType: "item",
    amountYen,
    printedAmountYen: amountYen,
    normalizedAmountYen: amountYen,
    amountBasis: basis,
    taxRatePercent: rates[index],
    taxAllocationStatus: "unallocated",
    categoryId: draft.categoryId,
    confidence: {},
    createdAt: 0,
    updatedAt: 0,
  }));
  return { draft, items };
}

function judgmentItems(items: AiExpenseDraftItemFields[]) {
  return items.map((item) => ({ ...item, _id: item.id }));
}

function save(
  draft: AiExpenseDraftFields & { amountYen: number },
  items: ReturnType<typeof receipt>["items"],
) {
  const plan = planDraftTaxInterpretation(
    draft,
    items,
    { receiptTotalSource: "user_confirmed" },
    1,
  );
  return {
    plan,
    saved: { ...draft, ...plan.draftPatch },
    savedItems: items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch })),
  };
}

describe("印字税内訳に依存しない登録額", () => {
  it("税込560円の印字税内訳が照合できなくても、同じ金額をプレビュー・保存・登録できる", () => {
    const { draft, items } = receipt([183, 183, 194], 560, "tax_included", [8, 8, 8]);
    draft.rawObservation.lines.push(observationLine("(8%対象 ¥519 消費税 ¥41)", 41, 1));
    items[2].categoryId = "other";
    const form = mapDraftToReviewForm(draft);
    const sourceItems = mapDraftItemsToReviewItems(judgmentItems(items));
    const preview = buildReviewTaxPreview(sourceItems, {
      ...buildReviewTaxEvidence(draft),
      paidTotalYen: 560,
    });
    expect(preview.items.map((item) => item.normalizedAmountYen)).toEqual([183, 183, 194]);
    expect(preview.items.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
    expect(
      getReviewGuidance(form, preview.items, { ...draft, taxSummaries: preview.taxSummaries }),
    ).toContainEqual(expect.objectContaining({ taxSummaryIndex: 0, required: false }));
    expect(judgeReviewFormAmountAndTax(draft, form, sourceItems).status).toBe("resolved");

    const { plan, saved, savedItems } = save(draft, items);
    expect(plan.draftPatch.status).toBe("ready");
    expect(plan.listSummary.amountAndTaxResolved).toBe(true);
    expect(buildDraftRegistrationItems(saved, savedItems)).toEqual([
      { itemName: "商品1、商品2", amountYen: 366, categoryId: "food" },
      { itemName: "商品3", amountYen: 194, categoryId: "other" },
    ]);
  });

  it("税抜の端数配分が一意なら、税内訳が食い違っても支払額に合わせる", () => {
    const { draft, items } = receipt([104, 102], 224, "tax_excluded", [8, 10]);
    draft.rawObservation.lines.push(
      observationLine("8%消費税 9円", 9, 1),
      observationLine("10%消費税 10円", 10, 2),
    );
    const preview = buildReviewTaxPreview(mapDraftItemsToReviewItems(judgmentItems(items)), {
      ...buildReviewTaxEvidence(draft),
      paidTotalYen: 224,
    });
    expect(preview.taxSummaries[0]).toMatchObject({
      taxYen: 9,
      warnings: expect.arrayContaining(["contradictory_receipt_tax_evidence"]),
    });
    expect(
      getReviewGuidance(mapDraftToReviewForm(draft), preview.items, {
        ...draft,
        taxSummaries: preview.taxSummaries,
      }),
    ).toContainEqual(expect.objectContaining({ taxSummaryIndex: 0, required: false }));
    const { plan, saved, savedItems } = save(draft, items);
    expect(plan.listSummary.amountAndTaxResolved).toBe(true);
    expect(savedItems.map((item) => item.normalizedAmountYen)).toEqual([112, 112]);
    expect(buildDraftRegistrationItems(saved, savedItems)).toMatchObject([{ amountYen: 224 }]);
  });

  it("印字税額があっても、支払額に合う税抜の端数配分が複数なら止める", () => {
    const { draft, items } = receipt([104, 102], 225, "tax_excluded", [8, 10]);
    draft.rawObservation.lines.push(
      observationLine("8%消費税 9円", 9, 1),
      observationLine("10%消費税 10円", 10, 2),
    );
    const { plan, saved, savedItems } = save(draft, items);
    expect(plan.listSummary.amountAndTaxResolved).toBe(false);
    expect(() => buildDraftRegistrationItems(saved, savedItems)).toThrow(/未確定/);
  });

  it.each([
    [100, -11, "tax_excluded", "tax_included"],
    [110, -10, "tax_included", "tax_excluded"],
  ] as const)(
    "価格区分が異なる商品%d円と割引%d円は合計99円で登録できる",
    (product, discount, productBasis, discountBasis) => {
      const { draft, items } = receipt([product, discount], 99, productBasis, [10, 10]);
      items[1] = {
        ...items[1],
        itemName: "割引",
        lineType: "discount",
        amountBasis: discountBasis,
        discountTargetItemId: items[0].id,
      };
      const { plan, saved, savedItems } = save(draft, items);
      expect(plan.listSummary.amountAndTaxResolved).toBe(true);
      expect(savedItems.map((item) => item.allocatedTaxYen)).toEqual([10, -1]);
      expect(savedItems.map((item) => item.normalizedAmountYen)).toEqual([110, -11]);
      expect(buildDraftRegistrationItems(saved, savedItems)).toMatchObject([{ amountYen: 99 }]);
    },
  );

  it("税抜額がほぼ相殺されても、それぞれのカテゴリへ税率に沿った税込額を登録する", () => {
    const { draft, items } = receipt([99, 330, -100], 328, "tax_excluded", [10, 10, 10]);
    const extracted = { ...draft, receiptDataContractVersion: RECEIPT_DATA_CONTRACT_VERSION };
    items[1] = { ...items[1], amountBasis: "tax_included", categoryId: "other" };
    items[2] = {
      ...items[2],
      itemName: "割引",
      lineType: "discount",
      categoryId: "other",
      discountTargetItemId: items[1].id,
    };
    const { plan, saved, savedItems } = save(extracted, items);
    expect(plan.listSummary.amountAndTaxResolved).toBe(true);
    expect(savedItems.map((item) => item.allocatedTaxYen)).toEqual([9, 30, -10]);
    expect(buildDraftRegistrationItems(saved, savedItems)).toMatchObject([
      { amountYen: 108, categoryId: "food" },
      { amountYen: 220, categoryId: "other" },
    ]);
  });

  it("支払額が読み取れていれば、別の合計行の金額が空でも登録できる", () => {
    const { draft, items } = receipt([108], 108, "tax_included", [8]);
    draft.rawObservation.lines.push({
      ...observationLine("合計", 0, 1),
      amountYen: null,
      amountText: null,
      lineRoleCandidates: ["total"],
    });
    expect(planDraftTaxInterpretation(draft, items, {}, 1).listSummary.amountAndTaxResolved).toBe(
      true,
    );
  });

  it("内税の有効な切り捨て額は配分用の四捨五入額と異なっても一致と扱う", () => {
    const { draft, items } = receipt([105], 105, "tax_included", [8]);
    draft.rawObservation.lines.push(observationLine("内消費税8% 7円", 7, 1));
    const preview = buildReviewTaxPreview(mapDraftItemsToReviewItems(judgmentItems(items)), {
      ...buildReviewTaxEvidence(draft),
      paidTotalYen: 105,
    });
    expect(preview.items[0]).toMatchObject({ allocatedTaxYen: 8, normalizedAmountYen: 105 });
    expect(preview.taxSummaries[0]).toMatchObject({ taxYen: 7, warnings: [], status: "verified" });
  });

  it.each(["お支払合計", "税込合計"])(
    "明細と保存支払額が一致しても、%sが異なる場合は確認を求める",
    (label) => {
      const { draft, items } = receipt([183, 183, 194], 560, "tax_included", [8, 8, 8]);
      draft.rawObservation.lines[0] = {
        ...observationLine(`${label} 561円`, 561, 0),
        lineRoleCandidates: ["total"],
      };
      expect(judgeDraftAmountAndTax({ ...draft, items: judgmentItems(items) }).status).toBe(
        "unresolved",
      );
    },
  );

  it("新規解析の下書きでは同カテゴリの商品が複数あっても割引先を保存するまで登録を止める", () => {
    const { draft, items } = receipt([170, 100, -10], 260, "tax_included", [8, 10, 8]);
    const extracted = { ...draft, receiptDataContractVersion: RECEIPT_DATA_CONTRACT_VERSION };
    items[2] = { ...items[2], itemName: "割引", lineType: "discount" };
    const plan = planDraftTaxInterpretation(extracted, items, {}, 1);
    expect(plan.draftPatch.status).toBe("needs_review");
    expect(() => buildDraftRegistrationItems(extracted, items)).toThrow(/未確定/);
    items[2].discountTargetItemId = items[0].id;
    expect(save(extracted, items).plan.draftPatch.status).toBe("ready");
  });
});
