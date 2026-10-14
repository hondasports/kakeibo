import { buildReviewTaxPreview } from "../../../../src/features/receipt-review/utils/reviewItemsTaxPreview";
import { expect, it } from "vitest";
import { reinterpretDraftTax } from "./reinterpretDraftTax";
import { observationLine, unprovenTargetReceipt } from "./fixtures/unprovenTargetReceipt";
import { buildDraftRegistrationItems } from "../../aiExpenseDrafts/registrationItems";
import {
  planDraftTaxInterpretation,
  validateTaxInterpretationEligibility,
} from "../../aiExpenseDrafts/taxInterpretationPlan";
import type { AiExpenseDraftFields } from "../../aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../aiExpenseDrafts/aiExpenseDraftItem";
import { updateForReviewHandler } from "../../../../convex/aiExpenseDrafts/mutations";
import {
  GROUP_ID,
  DRAFT_ID,
  CAT_ID,
  createInMemoryMutationCtx,
} from "../../../convex/aiExpenseDrafts/testHelpers";

it.each([[50], [51], [999], [50, 51], [51, 50], []].map((taxes) => ({ taxes })))(
  "旧税額候補$taxesを使わず、確認済み税抜505円と支払556円から51円を導出する",
  ({ taxes }) => {
    const input = unprovenTargetReceipt();
    input.amountYen = 556;
    input.items = [{ ...input.items[0], printedAmountYen: 505, amountBasis: "tax_excluded" }];
    input.rawObservationLines = [
      { ...observationLine("合計556円", 556, 0), lineRoleCandidates: ["total"] },
    ];
    input.taxSummaries = taxes.map((taxYen) => ({ ...input.taxSummaries[0], taxYen }));
    const result = reinterpretDraftTax(input);
    expect(result.itemFields[0]).toMatchObject({
      allocatedTaxYen: 51,
      normalizedAmountYen: 556,
      taxAllocationStatus: "allocated",
    });
  },
);

it.each([437, 438, 999])("確認済み税込商品は旧税額%dによらず同じ437円になる", (oldTax) => {
  const input = unprovenTargetReceipt();
  input.rawObservationLines = [];
  input.taxSummaries[0].taxYen = oldTax;
  expect(
    reinterpretDraftTax(input).itemFields.reduce((sum, item) => sum + item.allocatedTaxYen, 0),
  ).toBe(437);
});

it.each([false, true])("原文矛盾=%sでも未知商品を旧サマリだけで確定しない", (contradiction) => {
  const input = unprovenTargetReceipt();
  input.amountYen = 1100;
  input.items = [
    {
      ...input.items[0],
      printedAmountYen: 1100,
      amountBasis: "unknown",
      taxRatePercent: null,
      taxResolutionStatus: "unresolved",
    },
  ];
  input.taxSummaries = [
    { ...input.taxSummaries[0], taxableAmountYen: 1100, taxIncludedAmountYen: 1100, taxYen: 100 },
  ];
  input.rawObservationLines = contradiction ? [observationLine("10%税込対象9999円", 9999, 0)] : [];
  expect(reinterpretDraftTax(input).itemFields[0].taxAllocationStatus).toBe("unallocated");
});

it("複数外税率の丸め候補が同じ支払合計になる場合は確定しない", () => {
  const input = unprovenTargetReceipt();
  input.amountYen = 2193;
  input.items = [
    { ...input.items[0], printedAmountYen: 1010, amountBasis: "tax_excluded", taxRatePercent: 8 },
    { ...input.items[0], printedAmountYen: 1002, amountBasis: "tax_excluded", taxRatePercent: 10 },
  ];
  input.rawObservationLines = [];
  input.taxSummaries = [];
  expect(
    reinterpretDraftTax(input).itemFields.some(
      (item) => item.taxAllocationStatus === "unallocated",
    ),
  ).toBe(true);
});

function unknownFixture() {
  const draft: AiExpenseDraftFields & { amountYen: number } = {
    groupId: "g",
    sourceType: "image_upload",
    status: "needs_review",
    documentType: "receipt",
    shopName: "匿名店",
    date: "2026-10-14",
    amountYen: 1100,
    categoryId: "c",
    taxSummaries: [],
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    reviewReasons: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const items: Array<AiExpenseDraftItemFields & { id: string }> = [
    {
      id: "i",
      groupId: "g",
      draftId: "d",
      itemName: "商品",
      printedAmountYen: 1100,
      amountYen: 1100,
      amountBasis: "unknown",
      taxRatePercent: null,
      taxResolutionStatus: "unresolved",
      taxAllocationStatus: "unallocated",
      categoryId: "c",
      confidence: {},
      createdAt: 0,
      updatedAt: 0,
    },
  ];
  return { draft, items };
}

it("未確定保存でサマリが空になっても詳細登録の税ガードを迂回しない", () => {
  const { draft, items } = unknownFixture();
  const plan = planDraftTaxInterpretation(draft, items, {}, 1);
  const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  expect(() => buildDraftRegistrationItems({ ...draft, ...plan.draftPatch }, savedItems)).toThrow(
    /未確定/,
  );
});

it("空サマリでも金額がある下書きの再計算は許可する", () => {
  expect(validateTaxInterpretationEligibility(unknownFixture().draft, "g").success).toBe(true);
});

it("合計だけの明示確認は未確定税情報があっても引き続き登録できる", () => {
  const { draft, items } = unknownFixture();
  draft.registrationMode = "totalOnly";
  draft.receiptTotalResolution = {
    status: "verified",
    protectedAmountYen: 1100,
    candidates: [{ amountYen: 1100, source: "user_confirmed", evidence: "合計確認" }],
    reasons: [],
  };
  expect(buildDraftRegistrationItems(draft, items)[0].amountYen).toBe(1100);
});

it("サマリが空の未確定商品を全体税設定なしで保存してもreadyにしない", async () => {
  const { ctx, getDraft } = createInMemoryMutationCtx({
    draft: {
      _id: DRAFT_ID,
      groupId: GROUP_ID,
      sourceType: "image_upload",
      status: "needs_review",
      documentType: "receipt",
      shopName: "匿名店",
      date: "2026-10-14",
      amountYen: 1100,
      categoryId: CAT_ID,
      confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      warnings: [],
      reviewReasons: [],
      taxSummaries: [],
      createdAt: 0,
      updatedAt: 0,
    },
    items: [
      {
        _id: "i",
        groupId: GROUP_ID,
        draftId: DRAFT_ID,
        categoryId: CAT_ID,
        itemName: "商品",
        amountYen: 1100,
        printedAmountYen: 1100,
        amountBasis: "unknown",
        taxRatePercent: null,
        taxResolutionStatus: "unresolved",
        taxAllocationStatus: "unallocated",
        confidence: {},
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  });
  await updateForReviewHandler(ctx, {
    draftId: DRAFT_ID,
    documentType: "receipt",
    shopName: "匿名店",
    date: "2026-10-14",
    amountYen: 1100,
    categoryId: CAT_ID,
  });
  expect(getDraft().status).toBe("needs_review");
});

it.each([2188, 2190])("外税8%と10%の丸め組合せが一意なら合計%d円を再現する", (paid) => {
  const input = unprovenTargetReceipt();
  input.amountYen = paid;
  input.items = [
    { ...input.items[0], printedAmountYen: 1001, amountBasis: "tax_excluded", taxRatePercent: 8 },
    { ...input.items[0], printedAmountYen: 1007, amountBasis: "tax_excluded", taxRatePercent: 10 },
  ];
  input.rawObservationLines = [];
  input.taxSummaries = [];
  const result = reinterpretDraftTax(input);
  expect(result.itemFields.map((item) => item.allocatedTaxYen)).toEqual(
    paid === 2188 ? [80, 100] : [81, 101],
  );
  expect(result.itemFields.every((item) => item.taxAllocationStatus === "allocated")).toBe(true);
});

it.each(["single_summary", undefined] as const)(
  "未確認の商品区分%sは保存を繰り返しても確認済みに昇格しない",
  (source) => {
    const input = unprovenTargetReceipt();
    input.rawObservationLines = [];
    input.items = input.items.map((item) => ({
      ...item,
      taxResolutionStatus: "unresolved",
      taxResolutionSource: source,
    }));
    const first = reinterpretDraftTax(input);
    const second = reinterpretDraftTax({
      ...input,
      taxSummaries: first.interpretation.taxSummaries,
      items: first.itemFields.map((fields, index) => ({
        ...fields,
        itemName: input.items[index].itemName,
      })),
    });
    expect(first.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
    expect(second.itemFields.some((item) => item.taxAllocationStatus === "unallocated")).toBe(true);
  },
);

it("基準だけ既知で税率不明の空サマリも登録ガードを迂回しない", () => {
  const { draft, items } = unknownFixture();
  items[0].amountBasis = "tax_excluded";
  items[0].taxResolutionStatus = undefined;
  items[0].taxAllocationStatus = undefined;
  expect(() => buildDraftRegistrationItems(draft, items)).toThrow(/未確定/);
});

it.each([false, true])("税履歴だけ専用訂正=%sで残っていても未確定税を登録しない", (dedicated) => {
  const { draft, items } = unknownFixture();
  items[0].amountBasis = undefined;
  items[0].taxResolutionStatus = undefined;
  items[0].taxAllocationStatus = undefined;
  draft.receiptUserOverride = {
    source: "user",
    updatedAt: 0,
    fields: ["taxSummaries"],
    values: {
      status: "needs_review",
      documentType: "receipt",
      confidence: {},
      warnings: [],
      reviewReasons: [],
      items: [],
    },
    ...(dedicated
      ? {
          taxSummaryCorrections: [
            {
              ...unprovenTargetReceipt().taxSummaries[0],
              taxYen: 100,
              userEditedFields: ["taxYen"],
            },
          ],
        }
      : {}),
  };
  expect(() => buildDraftRegistrationItems(draft, items)).toThrow(/未確定/);
});

it("税モデルなしの旧手入力に単独未配分flagがあっても税込金額を登録できる", () => {
  const { draft, items } = unknownFixture();
  draft.taxSummaries = [];
  draft.receiptInterpretation = undefined;
  draft.rawObservation = undefined;
  items[0].amountBasis = undefined;
  items[0].taxRatePercent = undefined;
  items[0].taxResolutionStatus = undefined;
  items[0].taxAllocationStatus = "unallocated";
  expect(buildDraftRegistrationItems(draft, items)[0].amountYen).toBe(1100);
});

it("原文に合計がなくてもユーザー確認済み支払額を保存・再表示・登録で共有する", () => {
  const { draft, items } = unknownFixture();
  draft.amountYen = 1100;
  draft.rawObservation = {
    source: "ai_ocr",
    observedAt: 0,
    lines: [observationLine("10%税抜対象1000円", 1000, 0)],
  };
  items[0] = {
    ...items[0],
    amountYen: 1000,
    printedAmountYen: 1000,
    amountBasis: "tax_excluded",
    taxRatePercent: 10,
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
  };
  const plan = planDraftTaxInterpretation(
    draft,
    items,
    { receiptTotalSource: "user_confirmed" },
    1,
  );
  expect(plan.draftPatch.status).toBe("ready");
  const saved = { ...draft, ...plan.draftPatch };
  const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  const preview = buildReviewTaxPreview(
    savedItems.map((item) => ({
      ...item,
      id: item.id,
      amountYen: String(item.printedAmountYen),
      categoryId: "c",
    })),
    {
      paidTotalYen: saved.amountYen,
      rawObservation: saved.rawObservation,
      taxSummaries: saved.taxSummaries,
      receiptTotalResolution: saved.receiptTotalResolution,
    },
  );
  expect(preview.items[0]).toMatchObject({
    taxAllocationStatus: "allocated",
    normalizedAmountYen: 1100,
  });
  expect(buildDraftRegistrationItems(saved, savedItems)[0].amountYen).toBe(1100);
});
