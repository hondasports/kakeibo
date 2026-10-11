import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { updateSummaryTaxOverridesHandler } from "./updateSummaryTaxOverrides";

const GROUP_ID = "group-001" as Id<"groups">;
const DRAFT_ID = "draft-001" as Id<"aiExpenseDrafts">;
const ITEM_ID = "item-001" as Id<"aiExpenseDraftItems">;

function createCtx() {
  const docs = new Map<string, Record<string, unknown> & { _id: string }>();
  const draft = {
    _id: DRAFT_ID,
    groupId: GROUP_ID,
    status: "needs_review",
    amountYen: 1060,
    taxSummaries: [
      {
        taxRatePercent: 10,
        taxMode: "included",
        taxableAmountYen: 960,
        taxableAmountBasis: "tax_excluded",
        taxYen: 96,
        taxIncludedAmountYen: 1060,
        roundingMethod: "unknown",
        confidence: {},
        warnings: [] as string[],
      },
    ],
    markerDefinitions: [],
    documentType: "receipt",
    shopName: undefined,
    paymentPlace: undefined,
    payeeName: undefined,
    paymentPurpose: undefined,
    date: undefined,
    categoryId: undefined,
    confidence: {},
    warnings: [],
    reviewReasons: [],
  };
  const item = {
    _id: ITEM_ID,
    draftId: DRAFT_ID,
    groupId: GROUP_ID,
    itemName: "商品",
    amountYen: 1060,
    printedAmountYen: 1060,
    amountBasis: "unknown",
    taxRatePercent: null,
    markers: [],
    taxMarker: null,
    categoryName: null,
    quantity: 1,
    unitPriceYen: null,
    warnings: [],
    taxResolutionStatus: "unresolved",
    taxResolutionSource: null,
    taxReviewReasons: [],
    categoryId: null,
  };
  docs.set(DRAFT_ID, draft);
  docs.set(ITEM_ID, item);

  const ctx = {
    db: {
      get: vi.fn(async (id: string) => docs.get(id) ?? null),
      patch: vi.fn(async (id: string, fields: Record<string, unknown>) => {
        const current = docs.get(id);
        if (current) {
          docs.set(id, { ...current, ...fields });
        }
      }),
      insert: vi.fn(async () => {
        throw new Error("unexpected insert");
      }),
      delete: vi.fn(async () => {
        throw new Error("unexpected delete");
      }),
      query: vi.fn(() => ({
        withIndex: vi.fn((indexName: string, builder?: (q: unknown) => unknown) => {
          const filters: Record<string, unknown> = {};
          const q = {
            eq: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] = value;
              return q;
            }),
          };
          builder?.(q);
          const filtered = [...docs.values()].filter((doc) =>
            Object.entries(filters).every(([field, value]) => doc[field] === value),
          );
          return {
            order: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(filtered),
              collect: vi.fn().mockResolvedValue(filtered),
            }),
          };
        }),
      })),
    },
  } as unknown as MutationCtx;

  return { ctx, docs };
}

describe("updateSummaryTaxOverridesHandler", () => {
  it("taxableAmountYen を修正すると再解釈されて summary の矛盾が解消される", async () => {
    const { ctx } = createCtx();

    const result = await updateSummaryTaxOverridesHandler(
      ctx,
      {
        draftId: DRAFT_ID,
        summaryIndex: 0,
        taxableAmountYen: 1060,
        taxableAmountBasis: "tax_included",
      },
      GROUP_ID,
    );

    expect(result.draft.taxSummaries).toHaveLength(1);
    const updatedSummary = result.draft.taxSummaries![0];
    expect(updatedSummary.taxableAmountYen).toBe(1060);
    expect(updatedSummary.taxableAmountBasis).toBe("tax_included");
    expect(updatedSummary.status).toBe("verified");
    expect(result.items[0].taxResolutionStatus).toBe("resolved");
  });

  it("税額だけの編集は対象額の不明な出所と個別編集情報を保存後も維持する", async () => {
    const { ctx } = createCtx();
    for (const taxYen of [97, 98]) {
      const result = await updateSummaryTaxOverridesHandler(
        ctx,
        { draftId: DRAFT_ID, summaryIndex: 0, taxYen },
        GROUP_ID,
      );
      expect(result.draft.taxSummaries![0]).toMatchObject({
        taxableAmountYen: 960,
        taxYen,
        valueOrigin: { source: "unknown" },
        userEditedFields: ["taxYen"],
      });
    }
  });

  it("少なくとも1つの override フィールドが必要", async () => {
    const { ctx } = createCtx();
    await expect(
      updateSummaryTaxOverridesHandler(
        ctx,
        {
          draftId: DRAFT_ID,
          summaryIndex: 0,
        },
        GROUP_ID,
      ),
    ).rejects.toThrow("At least one tax override field");
  });

  it("summaryIndex が範囲外の場合はエラー", async () => {
    const { ctx } = createCtx();
    await expect(
      updateSummaryTaxOverridesHandler(
        ctx,
        {
          draftId: DRAFT_ID,
          summaryIndex: 1,
          taxYen: 0,
        },
        GROUP_ID,
      ),
    ).rejects.toThrow("out of range");
  });

  it("summaryIndex が小数・NaN・負数の場合はエラー", async () => {
    const { ctx } = createCtx();
    for (const summaryIndex of [0.5, NaN, -1]) {
      await expect(
        updateSummaryTaxOverridesHandler(
          ctx,
          {
            draftId: DRAFT_ID,
            summaryIndex,
            taxYen: 0,
          },
          GROUP_ID,
        ),
      ).rejects.toThrow("out of range");
    }
  });

  it("金額が負数・NaN・Infinity の場合はエラー", async () => {
    const { ctx } = createCtx();
    for (const taxableAmountYen of [-1, NaN, Infinity, -Infinity]) {
      await expect(
        updateSummaryTaxOverridesHandler(
          ctx,
          {
            draftId: DRAFT_ID,
            summaryIndex: 0,
            taxableAmountYen,
          },
          GROUP_ID,
        ),
      ).rejects.toThrow("must be a finite non-negative number");
    }
  });

  it("登録済み draft は編集不可", async () => {
    const { ctx, docs } = createCtx();
    docs.set(DRAFT_ID, { ...docs.get(DRAFT_ID)!, status: "registered" });
    await expect(
      updateSummaryTaxOverridesHandler(
        ctx,
        {
          draftId: DRAFT_ID,
          summaryIndex: 0,
          taxYen: 0,
        },
        GROUP_ID,
      ),
    ).rejects.toThrow("Registered");
  });
});
