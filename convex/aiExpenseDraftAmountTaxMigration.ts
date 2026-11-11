import { makeFunctionReference } from "convex/server";
import { convexToJson, v } from "convex/values";
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
  if (draft.status !== "ready" && draft.status !== "needs_review") return null;
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
  const listSummary = buildDraftListSummary(fields, items, judgment.status === "resolved");
  const removeReason =
    judgment.status === "resolved" && draft.reviewReasons.includes("amount_mismatch");
  const summaryChanged =
    draft.listSummary === undefined ||
    JSON.stringify(convexToJson(draft.listSummary)) !== JSON.stringify(convexToJson(listSummary));
  if (!removeReason && !summaryChanged) return null;
  if (!removeReason) return { kind: "summaryOnly" as const, patch: { listSummary } };
  const reviewReasons = draft.reviewReasons.filter((reason) => reason !== "amount_mismatch");
  return {
    kind: "reasonRemoval" as const,
    patch: {
      reviewReasons,
      status: reviewReasons.length ? ("needs_review" as const) : ("ready" as const),
      listSummary,
    },
  };
}

const scanResult = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  needsUpdate: v.number(),
  needsReasonRemoval: v.number(),
  needsSummaryOnly: v.number(),
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
    for (const draft of page.page) {
      const update = await updateForDraft(ctx, draft);
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
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("aiExpenseDrafts")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    let updated = 0;
    let reasonRemoved = 0;
    let summaryUpdatedOnly = 0;
    for (const draft of page.page) {
      const update = await updateForDraft(ctx, draft);
      if (update) {
        await ctx.db.patch(draft._id, update.patch);
        updated++;
        if (update.kind === "reasonRemoval") reasonRemoved++;
        else summaryUpdatedOnly++;
      }
    }
    console.log(
      `aiExpenseDraftAmountTaxMigration: updated=${updated} reasonRemoved=${reasonRemoved} summaryUpdatedOnly=${summaryUpdatedOnly} done=${page.isDone}`,
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
    };
  },
});
