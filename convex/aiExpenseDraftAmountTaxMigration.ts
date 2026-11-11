import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../lib/domain/aiExpenseDrafts/judgmentItemWindow";
import { judgeDraftAmountAndTax } from "../lib/domain/aiExpenseDrafts/draftAmountTaxJudgment";
import { buildDraftListSummary } from "../lib/domain/aiExpenseDrafts/listSummary";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../lib/convex/aiExpenseDrafts/draftRecordMapping";

const BATCH_SIZE = 25;
type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function updateForDraft(ctx: ReadCtx, draft: Doc<"aiExpenseDrafts">) {
  if (
    (draft.status !== "ready" && draft.status !== "needs_review") ||
    !draft.reviewReasons.includes("amount_mismatch")
  )
    return null;
  const items = (
    await ctx.db
      .query("aiExpenseDraftItems")
      .withIndex("by_group_id_and_draft_id", (q) =>
        q.eq("groupId", draft.groupId).eq("draftId", draft._id),
      )
      .order("asc")
      .take(DRAFT_JUDGMENT_ITEM_LIMIT)
  ).map(draftItemDocToFields);
  const fields = draftDocToFields(draft);
  const judgment = judgeDraftAmountAndTax({
    ...fields,
    items: items.map((item) => ({ ...item, _id: item.id })),
  });
  if (judgment.status !== "resolved") return null;
  const reviewReasons = draft.reviewReasons.filter((reason) => reason !== "amount_mismatch");
  return {
    reviewReasons,
    status: reviewReasons.length ? ("needs_review" as const) : ("ready" as const),
    listSummary: buildDraftListSummary(fields, items, true),
  };
}

const scanResult = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  needsUpdate: v.number(),
});
export const dryRun = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: scanResult,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("aiExpenseDrafts")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    let needsUpdate = 0;
    for (const draft of page.page) if (await updateForDraft(ctx, draft)) needsUpdate++;
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      needsUpdate,
    };
  },
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("aiExpenseDrafts")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    let updated = 0;
    for (const draft of page.page) {
      const patch = await updateForDraft(ctx, draft);
      if (patch) {
        await ctx.db.patch(draft._id, patch);
        updated++;
      }
    }
    console.log(`aiExpenseDraftAmountTaxMigration: updated=${updated} done=${page.isDone}`);
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
    };
  },
});
