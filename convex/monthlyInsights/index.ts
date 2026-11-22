import { ConvexError, v } from "convex/values";
import { action, internalMutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";
import { requireGroupMembership } from "../groups/membership";
import type { MutationCtx } from "../_generated/server";
import { createMonthlyInsightRepository } from "../../lib/convex/monthlyInsights/monthlyInsightRepository";
import { createMonthlyInsightGeneratorDeps } from "../../lib/convex/monthlyInsights/openaiClient";
import {
  buildFallbackInsight,
  buildMonthlyInsightPrompt,
  getPreviousMonth,
  insightNumbersAreConsistent,
  type MonthlyInsightInput,
  type MonthlyInsightMonthPoint,
} from "../../lib/domain/monthlyInsights/monthlyInsight";

export const getMonthlyInsight = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const { groupId } = await requireGroupMembership(ctx);
    const repo = createMonthlyInsightRepository(ctx as unknown as MutationCtx);
    return repo.findByGroupAndMonth(groupId, args.month);
  },
});

type MonthSummary = {
  totalAmountYen: number;
  totalIncomeYen: number;
  count: number;
  byCategory: Array<{ categoryName: string; totalAmountYen: number; count: number }>;
};

function toMonthPoint(summary: MonthSummary): MonthlyInsightMonthPoint {
  return {
    totalAmountYen: summary.totalAmountYen,
    totalIncomeYen: summary.totalIncomeYen,
    count: summary.count,
    byCategory: summary.byCategory.map((c) => ({
      categoryName: c.categoryName,
      amountYen: c.totalAmountYen,
      count: c.count,
    })),
  };
}

export const generateMonthlyInsight = action({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    // 所属は getMyGroup（未所属なら null）と集計クエリの requireGroupMembership で検証する
    const group = await ctx.runQuery(api.groups.queries.getMyGroup, {});
    if (group === null) {
      throw new ConvexError("グループに所属していません");
    }
    const current = await ctx.runQuery(api.receipts.summaries.getMonthSummaryWithCategories, {
      month: args.month,
    });
    let previous: MonthlyInsightMonthPoint | null = null;
    try {
      const prevSummary = await ctx.runQuery(api.receipts.summaries.getMonthSummaryWithCategories, {
        month: getPreviousMonth(args.month),
      });
      if (prevSummary.count > 0) previous = toMonthPoint(prevSummary);
    } catch {
      previous = null;
    }
    const input: MonthlyInsightInput = {
      month: args.month,
      current: toMonthPoint(current),
      previous,
    };

    const deps = createMonthlyInsightGeneratorDeps();
    const { appEnv, openAiApiKey } = deps.readEnvironment();
    let commentText: string;
    let source: "ai" | "fallback";
    if (appEnv === "production" && openAiApiKey) {
      try {
        const generated = await deps.callOpenAI(openAiApiKey, buildMonthlyInsightPrompt(input));
        if (insightNumbersAreConsistent(generated, input)) {
          commentText = generated;
          source = "ai";
        } else {
          // 入力集計値と一致しない金額を含む生成文は採用しない
          commentText = buildFallbackInsight(input);
          source = "fallback";
        }
      } catch {
        commentText = buildFallbackInsight(input);
        source = "fallback";
      }
    } else {
      commentText = buildFallbackInsight(input);
      source = "fallback";
    }

    await ctx.runMutation(internal.monthlyInsights.index.saveMonthlyInsight, {
      groupId: group._id,
      month: args.month,
      commentText,
      source,
    });
    return { commentText, source };
  },
});

export const saveMonthlyInsight = internalMutation({
  args: {
    groupId: v.id("groups"),
    month: v.string(),
    commentText: v.string(),
    source: v.union(v.literal("ai"), v.literal("fallback")),
  },
  handler: async (ctx, args) => {
    // groupId は呼び出し元の action が所属検証済みの値を渡す（internal のみ呼出可）
    const repo = createMonthlyInsightRepository(ctx);
    await repo.upsert({
      groupId: args.groupId,
      month: args.month,
      commentText: args.commentText,
      source: args.source,
      generatedAt: Date.now(),
    });
  },
});
