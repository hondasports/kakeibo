import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import type { Doc } from "../../../convex/_generated/dataModel";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";
import { GROUP_ID, DRAFT_ID, CAT_ID, StoredDoc, createInMemoryMutationCtx } from "./testHelpers";

describe("#835 保存時の税再解釈で未確定を解消する", () => {
  const resolvedItem = (overrides: Record<string, unknown>): StoredDoc => ({
    groupId: GROUP_ID,
    draftId: DRAFT_ID,
    categoryId: CAT_ID,
    amountBasis: "tax_included",
    taxRatePercent: 8,
    taxAllocationStatus: "unallocated",
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
    confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
    warnings: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const ambiguousSummary = (
    taxRatePercent: 8 | 10,
    taxableAmountYen: number,
    taxYen: number,
    taxMode: "included" | "external",
  ) => ({
    taxRatePercent,
    taxMode,
    taxableAmountYen,
    taxableAmountBasis: "unknown",
    taxYen,
    roundingMethod: "unknown",
    confidence: {},
    warnings: [],
    status: "ambiguous",
  });

  const makeCtx = (args: {
    amountYen: number;
    items: StoredDoc[];
    taxSummaries: ReturnType<typeof ambiguousSummary>[];
    status?: string;
  }) =>
    createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: args.status ?? "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-09-10",
        amountYen: args.amountYen,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: args.taxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: args.items,
    });

  const save = (ctx: MutationCtx, amountYen: number) =>
    updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-09-10",
      amountYen,
      categoryId: CAT_ID,
    });

  it("税込・混在税率で未確定が残る下書きを保存で自己修復し登録できる", async () => {
    const { ctx, getDraft, getItems } = makeCtx({
      amountYen: 3500,
      taxSummaries: [
        ambiguousSummary(8, 2000, 148, "included"),
        ambiguousSummary(10, 1500, 136, "included"),
      ],
      items: [
        resolvedItem({
          _id: "item-1",
          itemName: "食料品A",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-2",
          itemName: "食料品B",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-3",
          itemName: "日用品",
          amountYen: 1500,
          printedAmountYen: 1500,
          taxRatePercent: 10,
        }),
      ],
    });
    const register = () =>
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      );
    // 再現条件: 明細は解決済み表示だが配分は未確定のまま永続化されている
    expect(getItems().every((i) => i.taxAllocationStatus === "unallocated")).toBe(true);

    await save(ctx, 3500);

    expect(getDraft().status).toBe("ready");
    for (const item of getItems()) {
      expect(item.taxAllocationStatus).toBe("allocated");
      expect(item.normalizedAmountYen).toBe(item.printedAmountYen);
    }
    expect(register().reduce((sum, i) => sum + i.amountYen, 0)).toBe(3500);
    expect(getDraft().taxSummaries).toMatchObject([
      { taxableAmountBasis: "tax_included", status: "verified" },
      { taxableAmountBasis: "tax_included", status: "verified" },
    ]);
  });

  it("税抜・割引明細を含む下書きを保存で税込登録額まで確定する", async () => {
    const { ctx, getDraft, getItems } = makeCtx({
      amountYen: 2507,
      taxSummaries: [
        ambiguousSummary(8, 916, 73, "external"),
        ambiguousSummary(10, 1380, 138, "external"),
      ],
      items: [
        resolvedItem({
          _id: "item-1",
          itemName: "商品A",
          amountYen: 500,
          printedAmountYen: 500,
          amountBasis: "tax_excluded",
        }),
        resolvedItem({
          _id: "item-2",
          itemName: "商品B",
          amountYen: 500,
          printedAmountYen: 500,
          amountBasis: "tax_excluded",
        }),
        resolvedItem({
          _id: "item-3",
          itemName: "値引",
          amountYen: -84,
          printedAmountYen: -84,
          amountBasis: "tax_excluded",
          lineType: "discount",
        }),
        resolvedItem({
          _id: "item-4",
          itemName: "商品C",
          amountYen: 1380,
          printedAmountYen: 1380,
          amountBasis: "tax_excluded",
          taxRatePercent: 10,
        }),
      ],
    });
    const register = () =>
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      );
    // 税抜は normalizedAmountYen が未確定なので保存前の登録は拒否される
    expect(register).toThrow(/未確定/);

    await save(ctx, 2507);

    expect(getDraft().status).toBe("ready");
    expect(getItems().every((i) => i.taxAllocationStatus === "allocated")).toBe(true);
    expect(getItems().reduce((sum, i) => sum + Number(i.normalizedAmountYen), 0)).toBe(2507);
    expect(register().reduce((sum, i) => sum + i.amountYen, 0)).toBe(2507);
  });

  it("明細置換を伴う保存でも税フィールドを引き継いで配分を完了する", async () => {
    const { ctx, getDraft, getItems } = makeCtx({
      amountYen: 3500,
      taxSummaries: [
        ambiguousSummary(8, 2000, 148, "included"),
        ambiguousSummary(10, 1500, 136, "included"),
      ],
      items: [
        resolvedItem({
          _id: "item-1",
          itemName: "食料品A",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-2",
          itemName: "食料品B",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-3",
          itemName: "日用品",
          amountYen: 1500,
          printedAmountYen: 1500,
          taxRatePercent: 10,
        }),
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-09-10",
      amountYen: 3500,
      categoryId: CAT_ID,
      items: getItems().map((i) => ({
        itemId: i._id as Id<"aiExpenseDraftItems">,
        itemName: String(i.itemName),
        amountYen: Number(i.printedAmountYen),
        categoryId: CAT_ID,
      })),
    });

    expect(getDraft().status).toBe("ready");
    expect(getItems().every((i) => i.taxAllocationStatus === "allocated")).toBe(true);
    expect(
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      ).reduce((sum, i) => sum + i.amountYen, 0),
    ).toBe(3500);
  });

  it("税モードも基準も不明なサマリは保存後も未確定のまま残し登録を拒否する", async () => {
    const { ctx, getDraft, getItems } = makeCtx({
      amountYen: 3500,
      taxSummaries: [
        {
          taxRatePercent: 8,
          taxMode: "unknown",
          taxableAmountYen: 2000,
          taxableAmountBasis: "unknown",
          taxYen: 148,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
          status: "ambiguous",
        },
        {
          taxRatePercent: 10,
          taxMode: "unknown",
          taxableAmountYen: 1500,
          taxableAmountBasis: "unknown",
          taxYen: 136,
          roundingMethod: "unknown",
          confidence: {},
          warnings: [],
          status: "ambiguous",
        },
      ],
      items: [
        resolvedItem({
          _id: "item-1",
          itemName: "食料品A",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-2",
          itemName: "食料品B",
          amountYen: 1000,
          printedAmountYen: 1000,
        }),
        resolvedItem({
          _id: "item-3",
          itemName: "日用品",
          amountYen: 1500,
          printedAmountYen: 1500,
          taxRatePercent: 10,
        }),
      ],
    });
    const register = () =>
      buildDraftRegistrationItems(
        getDraft() as unknown as Doc<"aiExpenseDrafts">,
        getItems() as unknown as Doc<"aiExpenseDraftItems">[],
      );

    await save(ctx, 3500);

    expect(getDraft().status).toBe("needs_review");
    expect(getItems().some((i) => i.taxAllocationStatus === "unallocated")).toBe(true);
    expect(register).toThrow(/未確定/);
  });
});
