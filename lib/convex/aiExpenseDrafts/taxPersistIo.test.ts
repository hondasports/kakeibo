import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { GROUP_ID, DRAFT_ID, CAT_ID, createInMemoryMutationCtx } from "./testHelpers";
import { updateDraftItemTaxOverridesHandler } from "./updateItemTaxOverrides";
import { persistDraftTaxInterpretation } from "./persistTaxInterpretation";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";

const draftSeed = {
  _id: DRAFT_ID,
  groupId: GROUP_ID,
  status: "needs_review" as const,
  sourceType: "image_upload" as const,
  documentType: "receipt" as const,
  shopName: "テスト店",
  date: "2026-10-14",
  amountYen: 4810,
  categoryId: CAT_ID,
  confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
  warnings: [] as string[],
  reviewReasons: ["user_confirmation_required" as const],
  taxSummaries: [],
  createdAt: 0,
  updatedAt: 0,
};

const itemSeeds = [
  {
    _id: "item-1",
    groupId: GROUP_ID,
    draftId: DRAFT_ID,
    itemName: "商品A",
    printedAmountYen: 2410,
    amountYen: 2410,
    amountBasis: "tax_included" as const,
    taxRatePercent: 8 as const,
    taxResolutionStatus: "unresolved" as const,
    taxResolutionSource: "single_summary" as const,
    categoryId: CAT_ID,
    confidence: {},
    createdAt: 0,
    updatedAt: 0,
  },
  {
    _id: "item-2",
    groupId: GROUP_ID,
    draftId: DRAFT_ID,
    itemName: "商品B",
    printedAmountYen: 2400,
    amountYen: 2400,
    amountBasis: "tax_included" as const,
    taxRatePercent: 8 as const,
    taxResolutionStatus: "unresolved" as const,
    taxResolutionSource: "single_summary" as const,
    categoryId: CAT_ID,
    confidence: {},
    createdAt: 0,
    updatedAt: 0,
  },
];

function getCallsFor(ctx: { db: { get: unknown } }, id: string) {
  return vi
    .mocked(ctx.db.get as (...args: unknown[]) => unknown)
    .mock.calls.filter((call) => call[0] === id);
}

function itemReadCalls(ctx: { db: { query: unknown } }) {
  return vi
    .mocked(ctx.db.query as (...args: unknown[]) => unknown)
    .mock.calls.filter((call) => call[0] === "aiExpenseDraftItems");
}

function patchIds(ctx: { db: { patch: unknown } }) {
  return vi
    .mocked(ctx.db.patch as (...args: unknown[]) => unknown)
    .mock.calls.map((call) => call[0]);
}

describe("税再解釈系mutationのDatabase I/O", () => {
  it("updateDraftItemTaxOverrides は下書きを1回・明細一覧を1回だけ読む", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: { ...draftSeed },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: 10,
      },
      GROUP_ID,
    );

    expect(getCallsFor(ctx, DRAFT_ID)).toHaveLength(1);
    expect(itemReadCalls(ctx)).toHaveLength(1);
  });

  it("persistDraftTaxInterpretation は税関連フィールドが変わらない明細をpatchしない", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: { ...draftSeed },
      items: itemSeeds.map((item) => ({ ...item })),
    });
    const args = { draftId: DRAFT_ID, groupId: GROUP_ID };

    await persistDraftTaxInterpretation(ctx, args);
    vi.mocked(ctx.db.patch).mockClear();

    const result = await persistDraftTaxInterpretation(ctx, args);

    expect(patchIds(ctx).filter((id) => id !== DRAFT_ID)).toHaveLength(0);
    // patch を skip した明細は、返却値の updatedAt も DB の値と一致する
    for (const item of result.items) {
      const stored = getItems().find((doc) => doc._id === item._id);
      expect(item.updatedAt).toBe(stored?.updatedAt);
    }
  });

  it("persistDraftTaxInterpretation は変わった明細だけpatchする", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: { ...draftSeed },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: 10,
      },
      GROUP_ID,
    );
    vi.mocked(ctx.db.patch).mockClear();

    await updateDraftItemTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        itemId: getItems()[0]._id as Id<"aiExpenseDraftItems">,
        taxRatePercent: 8,
      },
      GROUP_ID,
    );

    const itemPatchIds = patchIds(ctx).filter((id) => id !== DRAFT_ID);
    expect(itemPatchIds).toEqual([getItems()[0]._id]);
    expect(getItems()[1]._id).toBe("item-2");
  });
});

describe("updateForReview の明細差分更新", () => {
  const noTaxDraftSeed = {
    ...draftSeed,
    taxSummaries: undefined,
  };

  const noTaxItemSeeds = [
    {
      _id: "item-1",
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      itemName: "商品A",
      printedAmountYen: 100,
      amountYen: 100,
      lineType: "item" as const,
      categoryId: CAT_ID,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 0,
      updatedAt: 0,
    },
    {
      _id: "item-2",
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      itemName: "商品B",
      printedAmountYen: 200,
      amountYen: 200,
      lineType: "item" as const,
      categoryId: CAT_ID,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 0,
      updatedAt: 0,
    },
  ];

  it("変更のない明細は削除・再挿入・patchしない", async () => {
    const { ctx } = createInMemoryMutationCtx({
      draft: { ...noTaxDraftSeed, amountYen: 300 },
      items: noTaxItemSeeds.map((item) => ({ ...item })),
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 300,
      categoryId: CAT_ID,
      items: noTaxItemSeeds.map((item) => ({
        itemId: item._id as Id<"aiExpenseDraftItems">,
        itemName: item.itemName,
        amountYen: item.amountYen,
        categoryId: CAT_ID,
        confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      })),
    });

    expect(vi.mocked(ctx.db.delete)).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.db.insert)).not.toHaveBeenCalled();
    expect(patchIds(ctx).filter((id) => id !== DRAFT_ID)).toHaveLength(0);
  });

  it("変更された明細だけpatchし、消えた明細はdelete・増えた明細はinsertする", async () => {
    const { ctx } = createInMemoryMutationCtx({
      draft: { ...noTaxDraftSeed, amountYen: 350 },
      items: noTaxItemSeeds.map((item) => ({ ...item })),
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 350,
      categoryId: CAT_ID,
      items: [
        {
          itemId: "item-1" as Id<"aiExpenseDraftItems">,
          itemName: "商品A",
          amountYen: 300,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
        {
          itemName: "商品C",
          amountYen: 50,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(patchIds(ctx)).toContain("item-1");
    expect(vi.mocked(ctx.db.delete)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.db.delete)).toHaveBeenCalledWith("item-2");
    expect(vi.mocked(ctx.db.insert)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.db.insert)).toHaveBeenCalledWith(
      "aiExpenseDraftItems",
      expect.objectContaining({ itemName: "商品C" }),
    );
  });

  it("updateForReview は下書きを1回・明細一覧を1回だけ読む", async () => {
    const { ctx } = createInMemoryMutationCtx({
      draft: { ...noTaxDraftSeed, amountYen: 300 },
      items: noTaxItemSeeds.map((item) => ({ ...item })),
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 300,
      categoryId: CAT_ID,
      items: noTaxItemSeeds.map((item) => ({
        itemId: item._id as Id<"aiExpenseDraftItems">,
        itemName: item.itemName,
        amountYen: item.amountYen,
        categoryId: CAT_ID,
      })),
    });

    expect(getCallsFor(ctx, DRAFT_ID)).toHaveLength(1);
    expect(itemReadCalls(ctx)).toHaveLength(1);
  });
});
