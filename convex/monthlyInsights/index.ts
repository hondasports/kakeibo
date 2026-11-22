import { ConvexError, v } from "convex/values";
import { action, internalMutation, query } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";
import { requireGroupMembership } from "../groups/membership";
import type { MutationCtx } from "../_generated/server";
import { createMonthlyInsightRepository } from "../../lib/convex/monthlyInsights/monthlyInsightRepository";
import { createMonthlyInsightGeneratorDeps } from "../../lib/convex/monthlyInsights/openaiClient";
import {
  buildFallbackInsight,
  buildMonthlyInsightPrompt,
  currentMonthInJapanTime,
  getPreviousMonth,
  INSIGHT_CACHE_TTL_MS,
  INSIGHT_MAX_GENERATIONS,
  insightNumbersAreConsistent,
  isValidMonthString,
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
  byCategory: Array<{
    categoryId: string;
    categoryName: string;
    totalAmountYen: number;
    count: number;
  }>;
};

function toMonthPoint(summary: MonthSummary): MonthlyInsightMonthPoint {
  return {
    totalAmountYen: summary.totalAmountYen,
    totalIncomeYen: summary.totalIncomeYen,
    count: summary.count,
    byCategory: summary.byCategory.map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      amountYen: c.totalAmountYen,
      count: c.count,
    })),
  };
}

type GenerateMonthlyInsightResult = {
  commentText: string;
  source: "ai" | "fallback";
  // 有料APIを叩かず保存済みを返したとき true
  cached: boolean;
  // 生成回数の上限に達していて再生成できないとき true
  generationLimitReached?: boolean;
};

export const generateMonthlyInsight = action({
  args: { month: v.string() },
  handler: async (ctx, args): Promise<GenerateMonthlyInsightResult> => {
    // 有料API呼出しの入口: month の形式と未来月を先に弾く
    if (!isValidMonthString(args.month)) {
      throw new ConvexError("monthはYYYY-MM形式で指定してください");
    }
    if (args.month > currentMonthInJapanTime(Date.now())) {
      throw new ConvexError("未来の月は生成できません");
    }
    // 所属は getMyGroup（未所属なら null）と集計クエリの requireGroupMembership で検証する
    const group = await ctx.runQuery(api.groups.queries.getMyGroup, {});
    if (group === null) {
      throw new ConvexError("グループに所属していません");
    }
    // 直近に生成済みなら保存済みを返す（有料APIを叩かない）。
    // 生成回数の上限（group×月 INSIGHT_MAX_GENERATIONS 回）に達した後も
    // 保存済みを返し、保存が無ければ上限到達を通知する。
    const existing = await ctx.runQuery(api.monthlyInsights.index.getMonthlyInsight, {
      month: args.month,
    });
    const usedGenerations = existing === null ? 0 : (existing.generationCount ?? 1);
    if (
      existing !== null &&
      (Date.now() - existing.generatedAt < INSIGHT_CACHE_TTL_MS ||
        usedGenerations >= INSIGHT_MAX_GENERATIONS)
    ) {
      return {
        commentText: existing.commentText,
        source: existing.source,
        cached: true,
        generationLimitReached: usedGenerations >= INSIGHT_MAX_GENERATIONS,
      };
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

    // 集計クエリは呼び出しのたびに「現在の利用グループ」を解決する。
    // 生成途中の切替・除名で別グループの集計が混ざったり保存先がずれたりしないよう、
    // 外部API呼び出し前と保存直前に利用中グループを再検証する。
    await assertSameActiveGroup(ctx, group._id);

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

    await assertSameActiveGroup(ctx, group._id);
    await ctx.runMutation(internal.monthlyInsights.index.saveMonthlyInsight, {
      groupId: group._id,
      month: args.month,
      commentText,
      source,
    });
    return { commentText, source, cached: false };
  },
});

async function assertSameActiveGroup(ctx: ActionCtx, expectedGroupId: Id<"groups">): Promise<void> {
  const again = await ctx.runQuery(api.groups.queries.getMyGroup, {});
  if (again === null || again._id !== expectedGroupId) {
    throw new ConvexError("利用中のグループが変更されたため生成を中止しました");
  }
}

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
