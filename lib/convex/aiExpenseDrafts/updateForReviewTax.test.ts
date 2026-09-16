import { unallocatedTaxReceipt } from "../../domain/receipt/tax/fixtures/unallocatedTaxReceipt";
import { updateSummaryTaxOverridesHandler } from "./updateSummaryTaxOverrides";
import { persistDraftTaxInterpretation } from "./persistTaxInterpretation";
import { buildDraftRegistrationItems } from "./reconcileExpenseEntries";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { UserIdentity } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { updateForReviewHandler } from "../../../convex/aiExpenseDrafts/mutations";
import { applyReceiptTaxSettingsHandler } from "./applyReceiptTaxSettings";
import { replaceDraftItemsForReview } from "./reviewValidation";
import { resetReceiptToAiInterpretationHandler } from "./receiptDataContract";

const GROUP_ID = "group-001" as Id<"groups">;
const DRAFT_ID = "draft-tax" as Id<"aiExpenseDrafts">;
const CAT_ID = "cat-food" as Id<"categories">;

function createIdentity(): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
  };
}

type StoredDoc = Record<string, unknown> & { _id: string };

function createInMemoryMutationCtx(initial: { draft: StoredDoc; items: StoredDoc[] }): {
  ctx: MutationCtx;
  getDraft: () => StoredDoc;
  getItems: () => StoredDoc[];
} {
  const docs = new Map<string, StoredDoc>();
  docs.set(initial.draft._id, { ...initial.draft });
  for (const item of initial.items) {
    docs.set(item._id, { ...item });
  }
  let insertCounter = 0;

  const groupMember = {
    _id: "member-001",
    _creationTime: 1000,
    groupId: GROUP_ID,
    userId: createIdentity().tokenIdentifier,
    role: "owner",
  };

  const ctx = {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(createIdentity()),
    },
    db: {
      get: vi.fn(async (id: string) => docs.get(id) ?? null),
      patch: vi.fn(async (id: string, fields: Record<string, unknown>) => {
        const current = docs.get(id);
        if (current) {
          docs.set(id, { ...current, ...fields });
        }
      }),
      insert: vi.fn(async (_table: string, doc: Record<string, unknown>) => {
        insertCounter += 1;
        const id = `item-new-${insertCounter}`;
        docs.set(id, { _id: id, ...doc });
        return id;
      }),
      delete: vi.fn(async (id: string) => {
        docs.delete(id);
      }),
      query: vi.fn(() => ({
        withIndex: vi.fn((indexName: string, builder?: (q: unknown) => unknown) => {
          if (indexName === "by_user_id") {
            const q = { eq: vi.fn().mockImplementation(() => q) };
            builder?.(q);
            return { unique: vi.fn().mockResolvedValue(groupMember) };
          }
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
            take: vi
              .fn()
              .mockImplementation(async (limit?: number) =>
                typeof limit === "number" ? filtered.slice(0, limit) : filtered,
              ),
            collect: vi.fn().mockResolvedValue(filtered),
            order: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(filtered),
              collect: vi.fn().mockResolvedValue(filtered),
            }),
          };
        }),
      })),
    },
  } as unknown as MutationCtx;

  docs.set(CAT_ID, { _id: CAT_ID, groupId: GROUP_ID, isActive: true });

  return {
    ctx,
    getDraft: () => docs.get(DRAFT_ID)!,
    getItems: () =>
      [...docs.values()].filter(
        (doc) => doc.draftId === DRAFT_ID && doc._id !== DRAFT_ID && doc._id !== CAT_ID,
      ),
  };
}

const externalTaxSummaries = [
  {
    taxRatePercent: 8 as const,
    taxMode: "external" as const,
    taxableAmountYen: 100,
    taxableAmountBasis: "tax_excluded" as const,
    taxYen: 8,
    roundingMethod: "unknown" as const,
    confidence: {},
    warnings: [] as string[],
  },
];

describe("updateForReviewHandler tax reinterpretation", () => {
  it("税集計がなくても2段階選択を再計算してsnapshotへ保存する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-08-27",
        amountYen: 1100,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品",
          amountYen: 1000,
          printedAmountYen: 1000,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
    });

    expect(getDraft()).toMatchObject({
      receiptTaxDecision: {
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate10",
        resolutionSource: "user",
      },
      receiptUserOverride: {
        fields: expect.arrayContaining(["receiptTaxDecision", "taxSummaries"]),
      },
    });
    expect(getItems()[0]).toMatchObject({ allocatedTaxYen: 100, normalizedAmountYen: 1100 });
  });

  it("2段階の税選択を保存し、AI判定よりユーザー判断を優先する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-08-27",
        amountYen: 1100,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: [
          {
            taxRatePercent: 10,
            taxMode: "external",
            taxableAmountYen: 1000,
            taxableAmountBasis: "tax_excluded",
            taxYen: 100,
            roundingMethod: "unknown",
            confidence: {},
            warnings: [],
            status: "verified",
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品",
          amountYen: 1000,
          printedAmountYen: 1000,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
      items: [
        {
          itemId: "item-1" as Id<"aiExpenseDraftItems">,
          itemName: "商品",
          amountYen: 1000,
          categoryId: CAT_ID,
        },
      ],
    });

    expect(getDraft().receiptTaxDecision).toMatchObject({
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
      resolutionSource: "user",
    });
    expect(getDraft().receiptUserOverride).toMatchObject({
      fields: expect.arrayContaining(["receiptTaxDecision", "taxSummaries"]),
      values: expect.objectContaining({
        receiptTaxDecision: expect.objectContaining({ resolutionSource: "user" }),
      }),
    });
    expect(getItems()[0]).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 10,
      normalizedAmountYen: 1100,
    });

    const totalOnly = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      registrationMode: "detailed",
      priceTaxTreatment: "unknown",
      taxRateComposition: "unknown",
    });
    expect(totalOnly).toMatchObject({
      status: "ready",
      registrationMode: "totalOnly",
      receiptTaxDecision: {
        priceTaxTreatment: "unknown",
        taxRateComposition: "unknown",
        resolutionSource: "user",
      },
    });

    const detailed = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-08-27",
      amountYen: 1100,
      categoryId: CAT_ID,
      priceTaxTreatment: "excluded",
      taxRateComposition: "rate10",
    });
    expect(detailed).toMatchObject({
      registrationMode: "detailed",
      receiptTaxDecision: {
        priceTaxTreatment: "excluded",
        taxRateComposition: "rate10",
        resolutionSource: "user",
      },
    });
  });

  it("削除・並べ替え・追加後も税情報を元の itemId にだけ引き継ぐ", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
      },
      items: [
        {
          _id: "item-a",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "削除する商品",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          amountBasis: "tax_included",
          taxRatePercent: 10,
          taxResolutionStatus: "resolved",
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "item-b",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "残す商品",
          amountYen: 200,
          printedAmountYen: 200,
          categoryId: CAT_ID,
          amountBasis: "tax_excluded",
          taxRatePercent: 8,
          allocatedTaxYen: 16,
          normalizedAmountYen: 216,
          taxResolutionStatus: "resolved",
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });

    await replaceDraftItemsForReview(
      ctx,
      DRAFT_ID,
      GROUP_ID,
      [
        {
          itemId: "item-b" as Id<"aiExpenseDraftItems">,
          itemName: "残す商品",
          amountYen: 200,
          categoryId: CAT_ID,
        },
        {
          itemName: "追加商品",
          amountYen: 300,
          categoryId: CAT_ID,
        },
      ] as Parameters<typeof replaceDraftItemsForReview>[3],
      3,
    );

    const remaining = getItems().find((item) => item.itemName === "残す商品");
    const added = getItems().find((item) => item.itemName === "追加商品");
    expect(remaining).toMatchObject({
      amountBasis: "tax_excluded",
      taxRatePercent: 8,
      allocatedTaxYen: 16,
      normalizedAmountYen: 216,
    });
    expect(added?.amountBasis).toBeUndefined();
    expect(added?.taxRatePercent).toBeUndefined();
    expect(added?.allocatedTaxYen).toBeUndefined();
  });

  it.each([
    {
      name: "同じ itemId の重複",
      itemIds: ["item-a", "item-a"],
      message: "Draft item ID must not be duplicated",
    },
    {
      name: "現在の下書きに存在しない itemId",
      itemIds: ["item-a", "item-other"],
      message: "Draft item does not belong to the current draft",
    },
  ])("$name を拒否する", async ({ itemIds, message }) => {
    const { ctx } = createInMemoryMutationCtx({
      draft: { _id: DRAFT_ID, groupId: GROUP_ID },
      items: [
        {
          _id: "item-a",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await expect(
      replaceDraftItemsForReview(
        ctx,
        DRAFT_ID,
        GROUP_ID,
        itemIds.map((itemId, index) => ({
          itemId: itemId as Id<"aiExpenseDraftItems">,
          itemName: `商品${index}`,
          amountYen: 100,
          categoryId: CAT_ID,
        })),
        2,
      ),
    ).rejects.toThrow(message);
  });

  it("税サマリ付き下書きの明細更新後も税再解釈を実行し printedAmountYen を保持する", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("ready");
    const items = getItems();
    expect(items[0]?.printedAmountYen).toBe(100);
    expect(items[0]?.taxResolutionStatus).toBe("resolved");
    expect(getDraft().taxSummaries).toBeDefined();
  });

  it("外税レシートで一括適用後の明細手修正でも税状態が維持され ready になり得る", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await applyReceiptTaxSettingsHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    const afterBulk = getItems();
    expect(afterBulk[0]?.taxResolutionStatus).toBe("resolved");

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("ready");
    expect(getItems()[0]?.taxResolutionStatus).toBe("resolved");
  });

  it("明細のみ修正で支払合計と不一致が残る場合は needs_review のまま", async () => {
    const { ctx, getDraft } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: [],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 90,
          printedAmountYen: 90,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 90,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("needs_review");
    expect(getDraft().reviewReasons).toContain("amount_mismatch");
  });

  it("明細金額の手修正は税再解釈後も printedAmountYen に保持される", async () => {
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          taxResolutionStatus: "unresolved",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 99,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    const items = getItems();
    expect(items[0]?.printedAmountYen).toBe(99);
    expect(items[0]?.taxResolutionStatus).toBe("unresolved");
  });

  it("ユーザーが7,803円へ修正した合計を743円+60円の税算術で上書きしない", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 803,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 0.5, categoryId: 1 },
        warnings: [],
        reviewReasons: ["amount_mismatch"],
        receiptTotalResolution: {
          status: "ambiguous",
          protectedAmountYen: 803,
          candidates: [
            {
              amountYen: 803,
              source: "explicit_label",
              evidence: "extraction.amountYen",
            },
            {
              amountYen: 7803,
              source: "payment_change",
              evidence: "cash_received:10000 - change:2197",
            },
          ],
          reasons: ["multiple_receipt_total_candidates"],
        },
        taxSummaries: [
          {
            ...externalTaxSummaries[0],
            taxableAmountYen: 743,
            taxYen: 60,
            taxIncludedAmountYen: 803,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 743,
          printedAmountYen: 743,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: 743,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.amountYen).toBe(7803);
    expect(result.status).toBe("needs_review");
    expect(getDraft().amountYen).toBe(7803);
    expect(getDraft().confidence.amountYen).toBe(1);
    expect(getDraft().receiptUserOverride).toMatchObject({
      source: "user",
      fields: expect.arrayContaining(["amountYen", "items"]),
      values: expect.objectContaining({
        amountYen: 7803,
        items: [expect.objectContaining({ itemName: "商品A", amountYen: 743 })],
      }),
    });
    expect(getDraft().receiptTotalResolution).toMatchObject({
      status: "verified",
      protectedAmountYen: 7803,
      candidates: expect.arrayContaining([
        expect.objectContaining({ amountYen: 7803, source: "user_confirmed" }),
        expect.objectContaining({
          amountYen: 7803,
          source: "payment_change",
          evidence: "cash_received:10000 - change:2197",
        }),
        expect.objectContaining({ amountYen: 803, source: "tax_arithmetic" }),
      ]),
    });
    expect(getItems()[0]).toMatchObject({
      printedAmountYen: 743,
      normalizedAmountYen: 743,
      allocatedTaxYen: 0,
      taxResolutionStatus: "unresolved",
    });
  });

  it("税率別集計なしでも補正額をuser_confirmed totalとして保存する", async () => {
    const { ctx, getDraft } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 803,
        categoryId: CAT_ID,
        confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        receiptTotalResolution: {
          status: "verified",
          protectedAmountYen: 803,
          candidates: [
            { amountYen: 803, source: "explicit_label", evidence: "extraction.amountYen" },
          ],
          reasons: [],
        },
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
    });

    expect(getDraft()).toMatchObject({
      amountYen: 7803,
      receiptTotalResolution: {
        status: "verified",
        protectedAmountYen: 7803,
        candidates: expect.arrayContaining([
          expect.objectContaining({ amountYen: 7803, source: "user_confirmed" }),
        ]),
      },
      receiptUserOverride: {
        fields: expect.arrayContaining(["amountYen", "receiptTotalResolution"]),
        values: expect.objectContaining({
          amountYen: 7803,
          receiptTotalResolution: expect.objectContaining({ protectedAmountYen: 7803 }),
        }),
      },
    });
  });

  it("明示操作でuser overrideを解除しAI interpretationへ戻せる", async () => {
    const aiValues = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "AI店舗",
      date: "2026-07-04",
      amountYen: 803,
      categoryId: CAT_ID,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: ["ai_warning"],
      reviewReasons: ["user_confirmation_required" as const],
      items: [
        {
          itemName: "AI商品",
          amountYen: 803,
          printedAmountYen: 803,
          categoryId: CAT_ID,
          confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
        },
      ],
    };
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        ...aiValues,
        sourceType: "image_upload",
        receiptInterpretation: { source: "ai", interpretedAt: 1, values: aiValues },
        rawObservation: {
          source: "ai_ocr",
          observedAt: 1,
          lines: [
            {
              rawText: "合計 803円",
              amountText: "803円",
              amountYen: 803,
              lineRoleCandidates: ["total"],
              roleConfidence: 0.9,
              explicitlyPrinted: true,
              sourceLineIndex: 1,
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-ai",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          ...aiValues.items[0],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "ユーザー店舗",
      date: "2026-07-04",
      amountYen: 7803,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "ユーザー商品",
          amountYen: 7803,
          categoryId: CAT_ID,
        },
      ],
    });
    expect(getDraft().receiptUserOverride).toBeDefined();

    await resetReceiptToAiInterpretationHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    expect(getDraft()).toMatchObject({
      shopName: "AI店舗",
      amountYen: 803,
      receiptUserOverride: undefined,
      rawObservation: expect.objectContaining({ source: "ai_ocr" }),
    });
    expect(getItems()).toEqual([
      expect.objectContaining({ itemName: "AI商品", amountYen: 803, printedAmountYen: 803 }),
    ]);
  });

  it("101件以上の明細を持つ下書きのリセットは全件削除してからスナップショットを復元する", async () => {
    const aiValues = {
      status: "needs_review" as const,
      documentType: "receipt" as const,
      shopName: "AI店舗",
      date: "2026-07-04",
      amountYen: 803,
      categoryId: CAT_ID,
      confidence: { shopName: 0.9, date: 0.9, amountYen: 0.9, categoryId: 0.9 },
      warnings: [] as string[],
      reviewReasons: ["user_confirmation_required" as const],
      items: [
        {
          itemName: "AI商品",
          amountYen: 803,
          printedAmountYen: 803,
          categoryId: CAT_ID,
          confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
        },
      ],
    };
    const staleItems = Array.from({ length: 101 }, (_, index) => ({
      _id: `stale-item-${index}`,
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      itemName: `旧明細${index}`,
      amountYen: 1,
      categoryId: CAT_ID,
      confidence: {},
      createdAt: index,
      updatedAt: index,
    }));
    const { ctx, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        ...aiValues,
        sourceType: "image_upload",
        receiptInterpretation: { source: "ai", interpretedAt: 1, values: aiValues },
        createdAt: 1,
        updatedAt: 1,
      },
      items: staleItems,
    });

    await resetReceiptToAiInterpretationHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);

    const items = getItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemName: "AI商品", amountYen: 803 });
    expect(items.every((item) => !item.itemName.startsWith("旧明細"))).toBe(true);
  });

  it("外税一括適用後に印字金額を変えず保存すると ready になり得る", async () => {
    const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
      draft: {
        _id: DRAFT_ID,
        groupId: GROUP_ID,
        status: "needs_review",
        documentType: "receipt",
        shopName: "テスト店",
        date: "2026-07-04",
        amountYen: 108,
        categoryId: CAT_ID,
        confidence: { shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
        warnings: [],
        reviewReasons: ["user_confirmation_required"],
        taxSummaries: externalTaxSummaries,
        createdAt: 1,
        updatedAt: 1,
      },
      items: [
        {
          _id: "item-1",
          groupId: GROUP_ID,
          draftId: DRAFT_ID,
          itemName: "商品A",
          amountYen: 100,
          printedAmountYen: 100,
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await applyReceiptTaxSettingsHandler(ctx, { draftId: DRAFT_ID }, GROUP_ID);
    const afterBulk = getItems()[0];
    expect(afterBulk?.taxResolutionStatus).toBe("resolved");
    expect(afterBulk?.printedAmountYen).toBe(100);

    const result = await updateForReviewHandler(ctx, {
      draftId: DRAFT_ID,
      documentType: "receipt",
      shopName: "テスト店",
      date: "2026-07-04",
      amountYen: 108,
      categoryId: CAT_ID,
      items: [
        {
          itemName: "商品A",
          amountYen: Number(afterBulk!.printedAmountYen),
          categoryId: CAT_ID,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
        },
      ],
    });

    expect(result.status).toBe("ready");
    expect(getItems()[0]?.printedAmountYen).toBe(100);
    expect(getDraft().reviewReasons).not.toContain("amount_mismatch");
  });
});

it("#748 旧0円下書きを保存・税内訳修正・割引修正して登録額を再現する", async () => {
  const fixture = unallocatedTaxReceipt();
  const { ctx, getDraft, getItems } = createInMemoryMutationCtx({
    draft: {
      _id: DRAFT_ID,
      groupId: GROUP_ID,
      status: "needs_review",
      documentType: "receipt",
      shopName: "匿名店",
      date: "2026-09-09",
      amountYen: 4662,
      categoryId: CAT_ID,
      confidence: { documentType: 1, shopName: 1, date: 1, amountYen: 1, categoryId: 1 },
      reviewReasons: [],
      taxSummaries: fixture.taxSummaries,
      createdAt: 1,
      updatedAt: 1,
    },
    items: fixture.items.map((item, index) => ({
      ...item,
      _id: "item-" + index,
      groupId: GROUP_ID,
      draftId: DRAFT_ID,
      amountYen: item.printedAmountYen,
      categoryId: CAT_ID,
      confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
      createdAt: 1,
      updatedAt: 1,
    })),
  });
  const register = () =>
    buildDraftRegistrationItems(
      getDraft() as unknown as Doc<"aiExpenseDrafts">,
      getItems() as unknown as Doc<"aiExpenseDraftItems">[],
    );
  expect(register).toThrow(/未確定/);
  await updateForReviewHandler(ctx, {
    draftId: DRAFT_ID,
    documentType: "receipt",
    shopName: "匿名店",
    date: "2026-09-09",
    amountYen: 4662,
    categoryId: CAT_ID,
  });
  expect(getDraft().status).toBe("needs_review");
  expect(getItems()[0].taxAllocationStatus).toBe("unallocated");
  for (const summaryIndex of [0, 1])
    await updateSummaryTaxOverridesHandler(
      ctx,
      { draftId: DRAFT_ID, summaryIndex, taxableAmountBasis: "tax_excluded" },
      GROUP_ID,
    );
  expect(register).toThrow(/未確定/);
  for (const itemIndex of [7, 8])
    await persistDraftTaxInterpretation(ctx, {
      draftId: DRAFT_ID,
      groupId: GROUP_ID,
      override: { itemIndex, taxRatePercent: 8 },
    });
  expect(getItems().reduce((sum, i) => sum + Number(i.allocatedTaxYen), 0)).toBe(370);
  expect(register().reduce((sum, i) => sum + i.amountYen, 0)).toBe(4662);
  await updateForReviewHandler(ctx, {
    draftId: DRAFT_ID,
    documentType: "receipt",
    shopName: "匿名店",
    date: "2026-09-09",
    amountYen: 4662,
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
  expect(register().reduce((sum, i) => sum + i.amountYen, 0)).toBe(4662);
});
