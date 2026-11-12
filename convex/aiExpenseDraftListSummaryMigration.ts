import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../lib/domain/aiExpenseDrafts/judgmentItemWindow";
import { buildDraftReviewState } from "../lib/domain/aiExpenseDrafts/draftReviewState";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../lib/convex/aiExpenseDrafts/draftRecordMapping";

// 1 transaction の読み書き上限に余裕を持たせるための小さな batch。
const BATCH_SIZE = 25;

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function loadPage(ctx: ReadCtx, cursor: string | null) {
  return await ctx.db.query("aiExpenseDrafts").paginate({ cursor, numItems: BATCH_SIZE });
}

// 一覧が listSummary を使う status（listDraftsByStatus と同じ境界）。
// それ以外の status の一覧は明細を読まず、保存値も使わないため補完しない。
function usesListSummary(draft: Doc<"aiExpenseDrafts">): boolean {
  return draft.status === "ready" || draft.status === "needs_review";
}

async function loadItems(ctx: ReadCtx, draft: Doc<"aiExpenseDrafts">) {
  return await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", draft.groupId).eq("draftId", draft._id),
    )
    .order("asc")
    .take(DRAFT_JUDGMENT_ITEM_LIMIT + 1);
}

const executeBatchResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  backfilled: v.number(),
  alreadyBackfilled: v.number(),
  skippedOverLimit: v.number(),
});

const scanResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  needsBackfill: v.number(),
  alreadyBackfilled: v.number(),
  skippedOverLimit: v.number(),
});

export const dryRun = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: scanResultValidator,
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let needsBackfill = 0;
    let alreadyBackfilled = 0;
    let skippedOverLimit = 0;
    for (const draft of page.page) {
      if (!usesListSummary(draft)) continue;
      if (draft.listSummary === undefined) {
        if ((await loadItems(ctx, draft)).length > DRAFT_JUDGMENT_ITEM_LIMIT) skippedOverLimit += 1;
        else needsBackfill += 1;
      } else alreadyBackfilled += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      needsBackfill,
      alreadyBackfilled,
      skippedOverLimit,
    };
  },
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: executeBatchResultValidator,
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let backfilled = 0;
    let alreadyBackfilled = 0;
    let skippedOverLimit = 0;
    for (const draft of page.page) {
      if (!usesListSummary(draft)) continue;
      if (draft.listSummary !== undefined) {
        alreadyBackfilled += 1;
        continue;
      }
      const items = await loadItems(ctx, draft);
      if (items.length > DRAFT_JUDGMENT_ITEM_LIMIT) {
        skippedOverLimit += 1;
        continue;
      }
      const listSummary = buildDraftReviewState(
        draftDocToFields(draft),
        items.map(draftItemDocToFields),
        { reasons: draft.reviewReasons, mode: "migration" },
      ).listSummary;
      // updatedAt は変えない（更新時刻は書き込み経路の意味論に従う）。
      await ctx.db.patch(draft._id, { listSummary });
      backfilled += 1;
    }
    const result = {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      backfilled,
      alreadyBackfilled,
      skippedOverLimit,
    };
    console.log(
      `aiExpenseDraftListSummaryMigration: backfilled=${backfilled} alreadyBackfilled=${alreadyBackfilled} skippedOverLimit=${skippedOverLimit} done=${page.isDone}`,
    );
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.aiExpenseDraftListSummaryMigration.executeBatch, {
        cursor: page.continueCursor,
      });
    }
    return result;
  },
});

export const verify = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    remaining: v.number(),
    skippedOverLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let remaining = 0;
    let skippedOverLimit = 0;
    for (const draft of page.page) {
      if (usesListSummary(draft) && draft.listSummary === undefined) {
        if ((await loadItems(ctx, draft)).length > DRAFT_JUDGMENT_ITEM_LIMIT) skippedOverLimit += 1;
        else remaining += 1;
      }
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      remaining,
      skippedOverLimit,
    };
  },
});
