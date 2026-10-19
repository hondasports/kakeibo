import { describe, expect, it, vi } from "vitest";
import { listByStatusHandler, listByStatusPaginatedHandler } from "./queries";
import {
  createIdentity,
  createQueryCtx,
  readyDraft,
  readyDraftItems,
  type DraftDoc,
} from "./testHelpers";

const SAVED_LIST_SUMMARY: NonNullable<DraftDoc["listSummary"]> = {
  amountAndTaxResolved: true,
  itemSummary: {
    itemTotalYen: 7_777,
    itemDifferenceYen: -6_577,
    hasUncategorizedItems: false,
    hasLowConfidenceItems: false,
    categoryAggregates: [{ categoryId: "cat-food", amountYen: 7_777 }],
  },
};

function queriedIndexNames(ctx: ReturnType<typeof createQueryCtx>): string[] {
  const queryMock = vi.mocked(ctx.db.query);
  return queryMock.mock.results.flatMap((result) =>
    (result.value.withIndex.mock.calls as [string][]).map(([indexName]) => indexName),
  );
}

describe("一覧の保存サマリ（listSummary）", () => {
  it("保存値がある下書きは明細を読まず、保存された itemSummary を返す", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [{ ...readyDraft, listSummary: SAVED_LIST_SUMMARY }],
      items: readyDraftItems,
    });

    const result = await listByStatusHandler(ctx, { status: "ready" });

    expect(result).toHaveLength(1);
    expect(result[0].listSummary).toEqual(SAVED_LIST_SUMMARY);
    expect(result[0].itemSummary).toEqual(SAVED_LIST_SUMMARY.itemSummary);
    expect(result[0]).not.toHaveProperty("items");
    expect(queriedIndexNames(ctx)).not.toContain("by_group_id_and_draft_id");
  });

  it("保存値が無い旧下書きは従来どおり明細を読んで集計する", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [{ ...readyDraft }],
      items: readyDraftItems,
    });

    const result = await listByStatusHandler(ctx, { status: "ready" });

    expect(result).toHaveLength(1);
    expect(result[0].itemSummary?.itemTotalYen).toBe(1_500);
    expect(result[0].items).toHaveLength(2);
    expect(queriedIndexNames(ctx)).toContain("by_group_id_and_draft_id");
  });

  it("保存値があっても明細行が残っていれば items は返さない（読まない）", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [{ ...readyDraft, listSummary: SAVED_LIST_SUMMARY }],
      items: readyDraftItems,
    });

    const result = await listByStatusPaginatedHandler(ctx, {
      status: "ready",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].itemSummary).toEqual(SAVED_LIST_SUMMARY.itemSummary);
    expect(result.page[0]).not.toHaveProperty("items");
    expect(queriedIndexNames(ctx)).not.toContain("by_group_id_and_draft_id");
  });

  it("ページング版も保存値が無い旧下書きは明細を読む", async () => {
    const ctx = createQueryCtx(createIdentity(), {
      drafts: [{ ...readyDraft }],
      items: readyDraftItems,
    });

    const result = await listByStatusPaginatedHandler(ctx, {
      status: "ready",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page[0].itemSummary?.itemTotalYen).toBe(1_500);
    expect(result.page[0].items).toHaveLength(2);
    expect(queriedIndexNames(ctx)).toContain("by_group_id_and_draft_id");
  });
});
