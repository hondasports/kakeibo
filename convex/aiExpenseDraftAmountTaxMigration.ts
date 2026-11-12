import { makeFunctionReference } from "convex/server";
import { convexToJson, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../lib/domain/aiExpenseDrafts/judgmentItemWindow";
import { buildDraftReviewState } from "../lib/domain/aiExpenseDrafts/draftReviewState";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../lib/convex/aiExpenseDrafts/draftRecordMapping";

const BATCH_SIZE = 25;
type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function updateForDraft(ctx: ReadCtx, draft: Doc<"aiExpenseDrafts">) {
  if (draft.status !== "ready" && draft.status !== "needs_review")
    return { update: null, skipped: false };
  const rows = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", draft.groupId).eq("draftId", draft._id),
    )
    .order("asc")
    .take(DRAFT_JUDGMENT_ITEM_LIMIT + 1);
  if (rows.length > DRAFT_JUDGMENT_ITEM_LIMIT) return { update: null, skipped: true };
  const items = rows.map(draftItemDocToFields);
  const fields = draftDocToFields(draft);
  const state = buildDraftReviewState(fields, items, {
    reasons: draft.reviewReasons,
    mode: "migration",
  });
  const listSummary = state.listSummary;
  const removeReason = state.reviewReasons.length !== draft.reviewReasons.length;
  const summaryChanged =
    draft.listSummary === undefined ||
    JSON.stringify(convexToJson(draft.listSummary)) !== JSON.stringify(convexToJson(listSummary));
  if (!removeReason && !summaryChanged) return { update: null, skipped: false };
  if (!removeReason)
    return { update: { kind: "summaryOnly" as const, patch: { listSummary } }, skipped: false };
  return {
    skipped: false,
    update: {
      kind: "reasonRemoval" as const,
      patch: {
        reviewReasons: state.reviewReasons,
        status: state.status,
        listSummary,
      },
    },
  };
}

const scanResult = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  needsUpdate: v.number(),
  needsReasonRemoval: v.number(),
  needsSummaryOnly: v.number(),
  skippedOverLimit: v.number(),
});
export const dryRun = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: scanResult,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("aiExpenseDrafts")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    let needsUpdate = 0;
    let needsReasonRemoval = 0;
    let needsSummaryOnly = 0;
    let skippedOverLimit = 0;
    for (const draft of page.page) {
      const { update, skipped } = await updateForDraft(ctx, draft);
      if (skipped) skippedOverLimit++;
      if (!update) continue;
      needsUpdate++;
      if (update.kind === "reasonRemoval") needsReasonRemoval++;
      else needsSummaryOnly++;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      needsUpdate,
      needsReasonRemoval,
      needsSummaryOnly,
      skippedOverLimit,
    };
  },
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    updated: v.number(),
    reasonRemoved: v.number(),
    summaryUpdatedOnly: v.number(),
    skippedOverLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("aiExpenseDrafts")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    let updated = 0;
    let reasonRemoved = 0;
    let summaryUpdatedOnly = 0;
    let skippedOverLimit = 0;
    for (const draft of page.page) {
      const { update, skipped } = await updateForDraft(ctx, draft);
      if (skipped) skippedOverLimit++;
      if (update) {
        await ctx.db.patch(draft._id, update.patch);
        updated++;
        if (update.kind === "reasonRemoval") reasonRemoved++;
        else summaryUpdatedOnly++;
      }
    }
    console.log(
      `aiExpenseDraftAmountTaxMigration: updated=${updated} reasonRemoved=${reasonRemoved} summaryUpdatedOnly=${summaryUpdatedOnly} skippedOverLimit=${skippedOverLimit} done=${page.isDone}`,
    );
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        makeFunctionReference<"mutation">("aiExpenseDraftAmountTaxMigration:executeBatch"),
        { cursor: page.continueCursor },
      );
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      updated,
      reasonRemoved,
      summaryUpdatedOnly,
      skippedOverLimit,
    };
  },
});
