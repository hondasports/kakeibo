import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { buildDraftListSummary } from "../../domain/aiExpenseDrafts/listSummary";
import {
  CAT_ID,
  createInMemoryMutationCtx,
  DRAFT_ID,
  GROUP_ID,
  type StoredDoc,
} from "./testHelpers";
import { draftDocToFields, draftItemDocToFields } from "./draftRecordMapping";
import { updateDraftItemTaxOverridesHandler } from "./updateItemTaxOverrides";
import { applyReceiptTaxSettingsHandler } from "./applyReceiptTaxSettings";
import { updateRegisteredDraftHandler } from "./updateRegisteredDraft";
import {
  createFailedDraftFromImageAnalysisHandler,
  createFromExtractionHandler,
} from "./createFromExtraction";
import {
  createIdentity,
  createMutationCtx,
  ownedDraft,
} from "../../../convex/aiExpenseDrafts/testHelpers";
import {
  resetReceiptToAiInterpretationMutationHandler,
  updateForReviewHandler,
} from "../../../convex/aiExpenseDrafts/mutations";

/**
 * 一覧用の保存サマリ（aiExpenseDrafts.listSummary）は、下書き・明細の最終状態から
 * buildDraftListSummary で再計算した値と一致しなければならない。
 * 事前に古い listSummary を埋め込んでおき、書き換わることも併せて固定する。
 */
const STALE_LIST_SUMMARY = {
  amountAndTaxResolved: false,
  itemSummary: {
    itemTotalYen: 999_999,
    itemDifferenceYen: -999_999,
    hasUncategorizedItems: true,
    hasLowConfidenceItems: true,
    categoryAggregates: [{ categoryId: "stale", amountYen: 999_999 }],
  },
};

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
  listSummary: STALE_LIST_SUMMARY,
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

/** 最終的に保存された下書き・明細から再計算した listSummary が doc に保存されていること。 */
function expectPersistedListSummary(getDraft: () => StoredDoc, getItems: () => StoredDoc[]) {
  const draft = getDraft() as unknown as Doc<"aiExpenseDrafts">;
  const items = getItems() as unknown as Doc<"aiExpenseDraftItems">[];
  const expected = buildDraftListSummary(draftDocToFields(draft), items.map(draftItemDocToFields));
  expect(draft.listSummary).toEqual(expected);
  expect(draft.listSummary).not.toEqual(STALE_LIST_SUMMARY);
}

describe("書き込み経路ごとの listSummary 保存", () => {
  it("updateDraftItemTaxOverrides: 明細の税オーバーライド後に保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: { ...draftSeed },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await updateDraftItemTaxOverridesHandler(
      ctx,
      { draftId: DRAFT_ID, itemId: "item-1" as Id<"aiExpenseDraftItems">, taxRatePercent: 10 },
      GROUP_ID,
    );

    expectPersistedListSummary(getDraft, getItems);
  });

  it("applyReceiptTaxSettings: 一括税設定後に保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        ...draftSeed,
        taxSummaries: [
          {
            taxRatePercent: 10 as const,
            taxMode: "included" as const,
            taxableAmountYen: 4810,
            taxableAmountBasis: "unknown" as const,
            taxYen: 437,
            roundingMethod: "unknown" as const,
            confidence: {},
            warnings: [] as string[],
          },
        ],
      },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await applyReceiptTaxSettingsHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    expectPersistedListSummary(getDraft, getItems);
  });

  it("updateForReview: レビュー保存（明細置き換え込み）後に保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: { ...draftSeed },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 4810,
      categoryId: CAT_ID,
      items: itemSeeds.map((item) => ({
        itemId: item._id as Id<"aiExpenseDraftItems">,
        itemName: item.itemName,
        amountYen: item.amountYen,
        categoryId: CAT_ID,
        confirmedTaxRatePercent: 10,
      })),
    });

    expectPersistedListSummary(getDraft, getItems);
  });

  it("updateForReview: 税解釈が無い下書きでも保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        ...draftSeed,
        taxSummaries: undefined as unknown as [],
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 4810,
          categoryId: CAT_ID,
          confidence: {},
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-10-14",
      amountYen: 4810,
      categoryId: CAT_ID,
    });

    expectPersistedListSummary(getDraft, getItems);
  });

  it("resetReceiptToAiInterpretation: AI 解釈へのリセット後に保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        ...draftSeed,
        shopName: "ユーザー編集後",
        receiptInterpretation: {
          source: "ai" as const,
          interpretedAt: 0,
          values: {
            status: "needs_review" as const,
            documentType: "receipt" as const,
            shopName: "AI解釈店",
            amountYen: 4810,
            categoryId: CAT_ID,
            confidence: {},
            warnings: [] as string[],
            reviewReasons: [] as never[],
            items: [
              {
                itemName: "AI商品",
                amountYen: 4810,
                categoryId: CAT_ID,
                confidence: {},
              },
            ],
          },
        },
        receiptUserOverride: {
          source: "user" as const,
          updatedAt: 0,
          fields: ["items"],
          values: {},
        },
      },
      items: itemSeeds.map((item) => ({ ...item })),
    });

    await resetReceiptToAiInterpretationMutationHandler(ctx, { draftId: DRAFT_ID });

    expect(getDraft().receiptUserOverride).toBeUndefined();
    expect(getDraft().shopName).toBe("AI解釈店");
    expectPersistedListSummary(getDraft, getItems);
  });

  it("updateRegisteredDraft: 履歴からの編集後に保存値を更新する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        ...draftSeed,
        status: "registered" as const,
        derivedRegistration: {
          source: "derived" as const,
          destination: "expense_entries" as const,
          registrationMode: "detailed" as const,
          amountYen: 4810,
          date: "2026-10-14",
          categoryIds: [CAT_ID],
          registeredAt: 0,
        },
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 4810,
          normalizedAmountYen: 4810,
          categoryId: CAT_ID,
          confidence: {},
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    await updateRegisteredDraftHandler(ctx, {
      draftId: DRAFT_ID,
      date: "2026-10-15",
      amountYen: 4810,
      categoryId: CAT_ID,
      shopName: "更新店",
      registrationMode: "detailed",
      items: [{ itemName: "商品A", amountYen: 4810, categoryId: CAT_ID }],
    });

    expectPersistedListSummary(getDraft, getItems);
  });
});

describe("解析結果からの作成", () => {
  it("createFromExtraction: 明細挿入後に listSummary を書き込む", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedIds: ["new-draft-id", "item-1"],
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "needs_review",
      },
      getDocById: {
        "cat-food": { _id: "cat-food", groupId: GROUP_ID, isActive: true },
      },
    });

    await createFromExtractionHandler(ctx, {
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1200,
      categoryId: "cat-food" as Id<"categories">,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: [],
      items: [
        {
          itemName: "食料品",
          amountYen: 1200,
          categoryId: "cat-food" as Id<"categories">,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    const inserts = vi.mocked(ctx.db.insert).mock.calls;
    const draftInsert = inserts.find((call) => call[0] === "aiExpenseDrafts");
    const itemInserts = inserts.filter((call) => call[0] === "aiExpenseDraftItems");
    expect(draftInsert).toBeDefined();
    expect(itemInserts).toHaveLength(1);

    const expected = buildDraftListSummary(
      { ...(draftInsert![1] as object), id: "new-draft-id" } as AiExpenseDraftFields,
      itemInserts.map(
        (call, index) =>
          ({ ...(call[1] as object), id: `item-${index + 1}` }) as AiExpenseDraftItemFields,
      ),
    );

    const patchCalls = vi.mocked(ctx.db.patch).mock.calls;
    const summaryPatch = patchCalls.find(
      ([id, fields]) => id === "new-draft-id" && "listSummary" in (fields as object),
    );
    expect(summaryPatch).toBeDefined();
    expect((summaryPatch![1] as { listSummary: unknown }).listSummary).toEqual(expected);
  });

  it("createFailedDraftFromImageAnalysis: 失敗下書きも未解決の保存値を持つ", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      insertedDoc: {
        ...ownedDraft,
        _id: "new-draft-id",
        status: "failed",
      },
    });

    await createFailedDraftFromImageAnalysisHandler(ctx, {
      warning: "[receipt_extraction:timeout] response body timeout",
      imageFileName: "receipt.jpg",
    });

    const draftInsert = vi
      .mocked(ctx.db.insert)
      .mock.calls.find((call) => call[0] === "aiExpenseDrafts");
    expect(draftInsert).toBeDefined();
    expect((draftInsert![1] as { listSummary: unknown }).listSummary).toEqual({
      amountAndTaxResolved: false,
    });
  });
});
