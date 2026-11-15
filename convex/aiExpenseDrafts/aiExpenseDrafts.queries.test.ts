import { describe, expect, it, vi } from "vitest";
import type { AiExpenseDraftItemFields } from "../../lib/domain/aiExpenseDrafts/aiExpenseDraftItem";
import { buildDraftListSummary } from "../../lib/domain/aiExpenseDrafts/listSummary";
import { deleteDraftHandler } from "./mutations";
import { getWithItemsHandler, listByStatusHandler, listByStatusPaginatedHandler } from "./queries";
import {
  GROUP_ID,
  OTHER_GROUP_ID,
  createIdentity,
  createMutationCtx,
  createQueryCtx,
  mixedCategoryDraftItems,
  ownedDraft,
  readyDraft,
} from "./testHelpers";

describe("aiExpenseDrafts (queries)", () => {
  it("未登録下書きは明細ごとキューから削除できる", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-owned": ownedDraft,
      },
      items: [
        {
          _id: "item-1",
          _creationTime: 1,
          groupId: GROUP_ID,
          draftId: "draft-owned",
          itemName: "牛乳",
          amountYen: 198,
          confidence: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await deleteDraftHandler(ctx, { draftId: "draft-owned" as any });

    expect(result).toEqual({ deleted: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("item-1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("draft-owned");
  });

  it.each([null, { ...ownedDraft, _id: "draft-target", groupId: OTHER_GROUP_ID }])(
    "存在しない下書きと他グループの下書きは削除せず同じ結果を返す",
    async (draft) => {
      const ctx = createMutationCtx(createIdentity(), { getDocById: { "draft-target": draft } });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deleteDraftHandler(ctx, { draftId: "draft-target" as any }),
      ).resolves.toEqual({ deleted: false });
      expect(ctx.db.delete).not.toHaveBeenCalled();
    },
  );

  it("登録済み下書きはキューから削除できない", async () => {
    const ctx = createMutationCtx(createIdentity(), {
      getDocById: {
        "draft-registered": {
          ...ownedDraft,
          _id: "draft-registered",
          status: "registered",
          registeredReceiptId: "receipt-1",
        },
      },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteDraftHandler(ctx, { draftId: "draft-registered" as any }),
    ).rejects.toMatchObject({
      data: "Registered AI expense draft cannot be deleted from the queue",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ctx.db as any).delete as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("listByStatus は認証ユーザー本人の下書きだけ返す", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [
        ownedDraft,
        {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      ],
    });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result).toEqual([ownedDraft]);
  });

  it("listByStatus はraw observation・AI interpretation・user overrideを破壊せず返す", async () => {
    const contractDraft = {
      ...ownedDraft,
      rawObservation: {
        source: "ai_ocr",
        observedAt: 1,
        lines: [
          {
            rawText: "合計 1,200円",
            amountText: "1,200円",
            amountYen: 1200,
            lineRoleCandidates: ["total"],
            roleConfidence: 0.9,
            explicitlyPrinted: true,
            sourceLineIndex: 5,
          },
        ],
      },
      receiptInterpretation: { source: "ai", interpretedAt: 1, values: { amountYen: 1200 } },
      receiptUserOverride: { source: "user", updatedAt: 2, fields: ["amountYen"] },
    };
    const ctx = createQueryCtx(createIdentity(), { drafts: [contractDraft] });

    const result = await listByStatusHandler(ctx, { status: "needs_review" });

    expect(result[0]).toMatchObject({
      rawObservation: contractDraft.rawObservation,
      receiptInterpretation: contractDraft.receiptInterpretation,
      receiptUserOverride: contractDraft.receiptUserOverride,
    });
  });

  it("listByStatus は保存済みの明細カテゴリ別集約サマリーを返し、明細は読まない", async () => {
    const draft = {
      ...readyDraft,
      amountYen: 1500,
    };
    const items = [
      ...mixedCategoryDraftItems,
      {
        _id: "draft-item-uncategorized",
        _creationTime: 0,
        groupId: GROUP_ID,
        draftId: "draft-ready",
        itemName: "未分類品",
        amountYen: 120,
        confidence: { itemName: 0.99, amountYen: 0.99, categoryId: 0.7 },
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    // 一覧が使う集約サマリーは書き込み時の保存値（buildDraftListSummary の結果）に限る。
    const listSummary = buildDraftListSummary(
      {
        groupId: GROUP_ID,
        sourceType: "image_upload",
        status: "ready",
        documentType: "receipt",
        amountYen: 1500,
        confidence: {},
        reviewReasons: [],
        createdAt: 0,
        updatedAt: 0,
      },
      items.map((item): AiExpenseDraftItemFields => ({
        id: item._id,
        groupId: item.groupId,
        draftId: item.draftId,
        itemName: item.itemName,
        amountYen: item.amountYen,
        categoryId: item.categoryId,
        confidence: item.confidence,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    );
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [{ ...draft, listSummary }],
      items,
    });

    const result = await listByStatusHandler(ctx, { status: "ready" });

    expect(result).toEqual([
      expect.objectContaining({
        _id: "draft-ready",
        itemSummary: {
          itemTotalYen: 1500,
          itemDifferenceYen: 0,
          hasUncategorizedItems: true,
          hasLowConfidenceItems: true,
          categoryAggregates: [
            { categoryId: "cat-food", amountYen: 400 },
            { categoryId: "cat-medical", amountYen: 980 },
          ],
        },
      }),
    ]);
    expect(result[0]).not.toHaveProperty("items");
    const queryMock = vi.mocked(ctx.db.query);
    const indexNames = queryMock.mock.results.flatMap((r) =>
      (r.value.withIndex.mock.calls as [string][]).map(([indexName]) => indexName),
    );
    expect(indexNames).not.toContain("by_group_id_and_draft_id");
  });

  it("listByStatusPaginated は numItems をそのまま paginate に渡し、registered では明細を読まない", async () => {
    const drafts = Array.from({ length: 15 }, (_, index) => ({
      ...ownedDraft,
      _id: `draft-registered-${index}`,
      status: "registered" as const,
      createdAt: index + 1,
    }));
    const ctx = createQueryCtx(createIdentity(), { drafts });

    const result = await listByStatusPaginatedHandler(ctx, {
      status: "registered",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(10);
    expect(result.isDone).toBe(false);
    const queryMock = ctx.db.query as ReturnType<typeof vi.fn>;
    const withIndexMock = queryMock.mock.results[0]?.value.withIndex as ReturnType<typeof vi.fn>;
    const indexNames = withIndexMock.mock.calls.map(([indexName]) => indexName);
    expect(indexNames).toContain("by_group_id_and_status_and_registered_at");
    expect(indexNames).not.toContain("by_group_id_and_draft_id");
    const paginateMock = withIndexMock.mock.results
      .map((call, index) => ({
        indexName: withIndexMock.mock.calls[index]?.[0],
        chain: call.value as { paginate?: ReturnType<typeof vi.fn> },
      }))
      .find((entry) => entry.indexName === "by_group_id_and_status_and_registered_at")
      ?.chain?.paginate;
    expect(paginateMock).toHaveBeenCalledWith({ numItems: 10, cursor: null });
  });

  it("getWithItems は他ユーザーの下書きを参照できない", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      getDocById: {
        "draft-other": {
          ...ownedDraft,
          _id: "draft-other",
          groupId: OTHER_GROUP_ID,
        },
      },
    });

    await expect(
      getWithItemsHandler(ctx, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftId: "draft-other" as any,
      }),
    ).resolves.toBeNull();
  });
});
