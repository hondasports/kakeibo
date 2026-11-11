import legacyCases from "./draftAmountTaxLegacyCases.json";
import { describe, expect, it } from "vitest";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { buildDraftRegistrationItems } from "./registrationItems";
import type { AiExpenseDraftJudgmentInput } from "./reviewTypes";

const base: AiExpenseDraftJudgmentInput = {
  documentType: "receipt",
  shopName: "店",
  date: "2026-11-01",
  amountYen: 90,
  categoryId: "food",
  reviewReasons: [],
  taxSummaries: [
    {
      taxRatePercent: 10,
      taxMode: "included",
      taxableAmountYen: 90,
      taxableAmountBasis: "tax_included",
      taxYen: 8,
      roundingMethod: "unknown",
      status: "verified",
      warnings: [],
    },
  ],
  items: [
    {
      _id: "a",
      itemName: "商品",
      lineType: "item",
      amountYen: 100,
      printedAmountYen: 100,
      normalizedAmountYen: 100,
      amountBasis: "tax_included",
      taxRatePercent: 10,
      taxAllocationStatus: "allocated",
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      categoryId: "food",
    },
    {
      _id: "b",
      itemName: "特売",
      lineType: "discount",
      amountYen: -10,
      printedAmountYen: -10,
      normalizedAmountYen: -10,
      amountBasis: "tax_included",
      taxRatePercent: 10,
      taxAllocationStatus: "allocated",
      taxResolutionStatus: "resolved",
      taxResolutionSource: "item_explicit",
      categoryId: "food",
    },
  ],
};
describe("下書きの金額・税の判定", () => {
  it("品名で判別できない割引行を含めて一致する", () => {
    expect(judgeDraftAmountAndTax(base)).toMatchObject({ status: "resolved" });
  });
  it("明細なしは対象外", () => {
    expect(judgeDraftAmountAndTax({ ...base, taxSummaries: [], items: [] })).toMatchObject({
      status: "not_applicable",
    });
  });
  it("合計のみは対象外", () => {
    expect(judgeDraftAmountAndTax({ ...base, registrationMode: "totalOnly" })).toMatchObject({
      status: "not_applicable",
    });
  });
  it("保存された割引カテゴリの合計が負なら未解決", () => {
    expect(
      judgeDraftAmountAndTax({
        ...base,
        items: base.items!.map((item, i) => (i ? { ...item, categoryId: "other" } : item)),
      }),
    ).toMatchObject({ status: "unresolved", reasons: ["amount_mismatch"] });
  });
  it("明細の合計が支払額と不一致なら未解決", () => {
    expect(judgeDraftAmountAndTax({ ...base, amountYen: 91 })).toMatchObject({
      status: "unresolved",
      reasons: expect.arrayContaining(["amount_mismatch"]),
    });
  });
  it("通常行の負額は未解決", () => {
    expect(
      judgeDraftAmountAndTax({
        ...base,
        items: base.items!.map((item, i) => (i ? { ...item, lineType: "item" as const } : item)),
      }),
    ).toMatchObject({ status: "unresolved", reasons: expect.arrayContaining(["amount_mismatch"]) });
  });
  it("税が未確定なら確認が必要", () => {
    expect(
      judgeDraftAmountAndTax({
        ...base,
        taxSummaries: [],
        items: base.items!.map((item) => ({
          ...item,
          amountBasis: "unknown" as const,
          taxRatePercent: null,
          taxResolutionStatus: "unresolved" as const,
        })),
      }),
    ).toMatchObject({
      status: "unresolved",
      reasons: expect.arrayContaining(["user_confirmation_required"]),
    });
  });
});

it("保存された割引カテゴリを正本・保存計画・登録で同じく拒否する", async () => {
  const { planDraftTaxInterpretation } = await import("./taxInterpretationPlan");
  const { buildDraftRegistrationItems } = await import("./registrationItems");
  const { buildExtractedDraftFields } = await import("./createFromExtraction");
  const confidence = { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 };
  const rawItems = base.items!.map((item, index) => ({
    ...item,
    categoryId: index ? "other" : "food",
    groupId: "group",
    draftId: "draft",
    id: item._id!,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  const draft = {
    ...base,
    amountYen: 90,
    id: "draft",
    groupId: "group",
    sourceType: "image_upload" as const,
    status: "needs_review" as const,
    confidence,
    warnings: [],
    taxSummaries: base.taxSummaries!.map((summary) => ({ ...summary, confidence: {} })),
    createdAt: 0,
    updatedAt: 0,
  };
  const plan = planDraftTaxInterpretation(
    draft,
    rawItems,
    { receiptTotalSource: "user_confirmed" },
    0,
  );
  const savedItems = rawItems.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  const savedDraft = { ...draft, ...plan.draftPatch };
  expect(judgeDraftAmountAndTax({ ...savedDraft, items: savedItems })).toMatchObject({
    status: "unresolved",
    reasons: expect.arrayContaining(["amount_mismatch"]),
  });
  expect(plan.draftPatch).toMatchObject({
    status: "needs_review",
    reviewReasons: expect.arrayContaining(["amount_mismatch"]),
  });
  expect(() => buildDraftRegistrationItems(savedDraft, savedItems)).toThrow(/category total/);
  const created = buildExtractedDraftFields(
    { userId: "user", groupId: "group" },
    { ...draft, items: rawItems },
    0,
  );
  expect(created.draft.reviewReasons).toContain("amount_mismatch");
});

it("保存計画の理由と保存後の正本判定が一致する", async () => {
  const { planDraftTaxInterpretation } = await import("./taxInterpretationPlan");
  const confidence = { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 };
  const items = base.items!.map((item) => ({
    ...item,
    groupId: "group",
    draftId: "draft",
    id: item._id!,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  const draft = {
    ...base,
    amountYen: 91,
    id: "draft",
    groupId: "group",
    sourceType: "image_upload" as const,
    status: "needs_review" as const,
    confidence,
    warnings: [],
    taxSummaries: base.taxSummaries!.map((summary) => ({ ...summary, confidence: {} })),
    createdAt: 0,
    updatedAt: 0,
  };
  const plan = planDraftTaxInterpretation(
    draft,
    items,
    { receiptTotalSource: "user_confirmed" },
    0,
  );
  const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  const saved = { ...draft, ...plan.draftPatch, items: savedItems };
  expect(judgeDraftAmountAndTax(saved).reasons).toEqual(
    plan.draftPatch.reviewReasons.filter(
      (reason) => reason === "amount_mismatch" || reason === "user_confirmation_required",
    ),
  );
});

it("税が未確定で合計も違う保存値は再判定でも両方の理由が残る", async () => {
  const { planDraftTaxInterpretation } = await import("./taxInterpretationPlan");
  const confidence = { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 };
  const items = base.items!.map((item, index) => ({
    ...item,
    lineType: "item" as const,
    amountYen: index ? 10 : 100,
    printedAmountYen: index ? 10 : 100,
    normalizedAmountYen: undefined,
    amountBasis: "unknown" as const,
    taxRatePercent: null,
    taxAllocationStatus: undefined,
    taxResolutionStatus: undefined,
    taxResolutionSource: undefined,
    groupId: "group",
    draftId: "draft",
    id: item._id!,
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  const draft = {
    ...base,
    amountYen: 1,
    id: "draft",
    groupId: "group",
    sourceType: "image_upload" as const,
    status: "needs_review" as const,
    confidence,
    warnings: [],
    taxSummaries: [],
    createdAt: 0,
    updatedAt: 0,
  };
  const plan = planDraftTaxInterpretation(
    draft,
    items,
    { receiptTotalSource: "user_confirmed" },
    0,
  );
  const savedItems = items.map((item, index) => ({ ...item, ...plan.itemPatches[index].patch }));
  expect(
    judgeDraftAmountAndTax({ ...draft, ...plan.draftPatch, items: savedItems }).reasons,
  ).toEqual(["user_confirmation_required", "amount_mismatch"]);
});

it("登録時は支払額のない明細を拒否する", async () => {
  const { buildDraftRegistrationItems } = await import("./registrationItems");
  const items = base.items!.map((item) => ({
    ...item,
    id: item._id!,
    groupId: "group",
    draftId: "draft",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    createdAt: 0,
    updatedAt: 0,
  }));
  expect(() => buildDraftRegistrationItems({ ...base, amountYen: undefined }, items)).toThrow();
});

it("明細なしでも税メタデータがあれば未解決", () => {
  expect(judgeDraftAmountAndTax({ ...base, items: [] })).toMatchObject({
    status: "unresolved",
    reasons: expect.arrayContaining(["amount_mismatch"]),
  });
});

it("判定窓と全件の対象範囲を明示的に選べる", () => {
  const item = { itemName: "商品", amountYen: 1, categoryId: "food" };
  const draft = {
    documentType: "receipt" as const,
    amountYen: 100,
    categoryId: "food",
    reviewReasons: [],
    items: Array.from({ length: 101 }, () => item),
  };
  expect(judgeDraftAmountAndTax(draft, { itemScope: "judgment_window" }).status).toBe("resolved");
  expect(judgeDraftAmountAndTax(draft, { itemScope: "all_items" })).toMatchObject({
    status: "unresolved",
    reasons: ["amount_mismatch"],
  });
});

it("保存値は再計算額と異なる保存済み金額を拒否する", () => {
  const draft = {
    ...base,
    items: base.items!.map((item, index) =>
      index === 0 ? { ...item, normalizedAmountYen: 101 } : item,
    ),
  };
  const interpreted = judgeDraftAmountAndTax(draft, {
    itemScope: "all_items",
    inputKind: "form",
  });
  const stored = judgeDraftAmountAndTax(draft, {
    itemScope: "all_items",
  });
  expect(interpreted.status).toBe("resolved");
  expect(stored).toMatchObject({
    status: "unresolved",
    reasons: expect.arrayContaining(["user_confirmation_required"]),
  });
});

it("明細なしで税の証拠があると保存と登録の両方が未解決になる", async () => {
  const { planDraftTaxInterpretation } = await import("./taxInterpretationPlan");
  const { buildDraftRegistrationItems } = await import("./registrationItems");
  const draft = {
    ...base,
    id: "draft",
    groupId: "group",
    sourceType: "image_upload" as const,
    status: "needs_review" as const,
    amountYen: 90,
    confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    taxSummaries: base.taxSummaries!.map((s) => ({ ...s, confidence: {} })),
    createdAt: 0,
    updatedAt: 0,
  };
  const plan = planDraftTaxInterpretation(draft, [], { receiptTotalSource: "user_confirmed" }, 0);
  expect(plan.draftPatch.reviewReasons).toContain("amount_mismatch");
  expect(judgeDraftAmountAndTax({ ...draft, ...plan.draftPatch, items: [] })).toMatchObject({
    status: "unresolved",
  });
  expect(() => buildDraftRegistrationItems({ ...draft, ...plan.draftPatch }, [])).toThrow(/未確定/);
});

it("保存されていない割引対象は推定せず割引自身の税率で照合する", () => {
  const draft = {
    ...base,
    amountYen: 198,
    taxSummaries: [
      {
        taxRatePercent: 8 as const,
        taxMode: "included" as const,
        taxableAmountYen: 100,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 7,
        roundingMethod: "unknown" as const,
        status: "verified" as const,
        warnings: [],
      },
      {
        taxRatePercent: 10 as const,
        taxMode: "included" as const,
        taxableAmountYen: 98,
        taxableAmountBasis: "tax_included" as const,
        taxYen: 9,
        roundingMethod: "unknown" as const,
        status: "verified" as const,
        warnings: [],
      },
    ],
    items: [
      {
        ...base.items![0],
        _id: "a",
        amountYen: 100,
        printedAmountYen: 100,
        normalizedAmountYen: 100,
        taxRatePercent: 8 as const,
        categoryId: "other",
      },
      {
        ...base.items![1],
        _id: "b",
        amountYen: -10,
        printedAmountYen: -10,
        normalizedAmountYen: -10,
        taxRatePercent: 10 as const,
        categoryId: "other",
      },
      {
        ...base.items![0],
        _id: "c",
        amountYen: 108,
        printedAmountYen: 108,
        normalizedAmountYen: 108,
        taxRatePercent: 10 as const,
        categoryId: "food",
      },
    ],
  };
  expect(judgeDraftAmountAndTax(draft).status).toBe("resolved");
  expect(
    judgeDraftAmountAndTax({
      ...draft,
      items: draft.items.map((item, i) =>
        i === 1 ? { ...item, discountTargetItemId: "c" } : item,
      ),
    }).status,
  ).toBe("resolved");
  expect(
    judgeDraftAmountAndTax({
      ...draft,
      items: draft.items.map((item, i) =>
        i === 1 ? { ...item, discountTargetItemId: "a" } : item,
      ),
    }).status,
  ).toBe("unresolved");
});

it.each(legacyCases)(
  "印字額欠落の保存明細を旧登録経路と同じ金額で判定する %#",
  ({ draft, items }) => {
    const saved = { ...draft, documentType: "receipt" as const, items } as unknown as Parameters<
      typeof judgeDraftAmountAndTax
    >[0];
    const judgment = judgeDraftAmountAndTax(saved, {
      itemScope: "all_items",
    });
    expect(judgment.status).toBe("resolved");
    expect(() =>
      buildDraftRegistrationItems(
        draft as unknown as Parameters<typeof buildDraftRegistrationItems>[0],
        items as unknown as Parameters<typeof buildDraftRegistrationItems>[1],
      ),
    ).not.toThrow();
  },
);
