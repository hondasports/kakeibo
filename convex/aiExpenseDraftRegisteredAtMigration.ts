import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// 1 transaction の読み書き上限に余裕を持たせるための小さな batch。
const BATCH_SIZE = 25;

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function loadPage(ctx: ReadCtx, cursor: string | null) {
  return await ctx.db.query("aiExpenseDrafts").paginate({ cursor, numItems: BATCH_SIZE });
}

const scanResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
  needsBackfill: v.number(),
  alreadyBackfilled: v.number(),
});

export const dryRun = internalQuery({
  args: { cursor: v.optional(v.string()) },
  returns: scanResultValidator,
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let needsBackfill = 0;
    let alreadyBackfilled = 0;
    for (const draft of page.page) {
      if (draft.status !== "registered") continue;
      if (draft.registeredAt === undefined) needsBackfill += 1;
      else alreadyBackfilled += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      needsBackfill,
      alreadyBackfilled,
    };
  },
});

export const executeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    backfilled: v.number(),
    alreadyBackfilled: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let backfilled = 0;
    let alreadyBackfilled = 0;
    for (const draft of page.page) {
      if (draft.status !== "registered") continue;
      if (draft.registeredAt !== undefined) {
        alreadyBackfilled += 1;
        continue;
      }
      await ctx.db.patch(draft._id, {
        registeredAt: draft.derivedRegistration?.registeredAt ?? draft.updatedAt,
      });
      backfilled += 1;
    }
    const result = {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      backfilled,
      alreadyBackfilled,
    };
    console.log(
      `aiExpenseDraftRegisteredAtMigration: backfilled=${backfilled} alreadyBackfilled=${alreadyBackfilled} done=${page.isDone}`,
    );
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.aiExpenseDraftRegisteredAtMigration.executeBatch, {
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
  }),
  handler: async (ctx, args) => {
    const page = await loadPage(ctx, args.cursor ?? null);
    let remaining = 0;
    for (const draft of page.page) {
      if (draft.status === "registered" && draft.registeredAt === undefined) remaining += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      remaining,
    };
  },
});
