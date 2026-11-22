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
  INSIGHT_MAX_REGENERATIONS,
  INSIGHT_RESERVATION_TTL_MS,
  insightNumbersAreConsistent,
  replaceCategorySymbols,
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
  // 再生成回数の上限に達していて再生成できないとき true
  generationLimitReached?: boolean;
  // 別の生成が進行中で今回は新たに生成しなかったとき true
  generationInProgress?: boolean;
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
    const existing = await ctx.runQuery(api.monthlyInsights.index.getMonthlyInsight, {
      month: args.month,
    });
    if (existing !== null && Date.now() - existing.generatedAt < INSIGHT_CACHE_TTL_MS) {
      return {
        commentText: existing.commentText,
        source: existing.source,
        cached: true,
      };
    }
    // 生成枠を予約してから有料APIを呼ぶ。mutation は直列化されるため、
    // 同じ group×月への並列呼び出しが同時に生成へ進むことはない。
    // 再生成の回数上限は group×月あたり INSIGHT_MAX_REGENERATIONS 回（初回は含まない）。
    const reservation = await ctx.runMutation(
      internal.monthlyInsights.index.reserveMonthlyInsightGeneration,
      { groupId: group._id, month: args.month },
    );
    if (reservation === "limit") {
      return {
        commentText: existing?.commentText ?? "",
        source: existing?.source ?? "fallback",
        cached: true,
        generationLimitReached: true,
      };
    }
    if (reservation === "in_progress") {
      return {
        commentText: existing?.commentText ?? "",
        source: existing?.source ?? "fallback",
        cached: true,
        generationInProgress: true,
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
          // プロンプトではカテゴリ記号で送っているので実名に戻す
          commentText = replaceCategorySymbols(generated, input);
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

// 生成枠の予約。同じ group×月への並列呼び出しを直列化して、
// 有料API呼出しが重ならないようにする。上限超過・進行中は生成を拒否する。
export async function reserveMonthlyInsightGenerationHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; month: string },
): Promise<"reserved" | "in_progress" | "limit"> {
  const now = Date.now();
  const existing = await ctx.db
    .query("monthlyInsights")
    .withIndex("by_group_id_and_month", (q) =>
      q.eq("groupId", args.groupId).eq("month", args.month),
    )
    .unique();
  if (existing !== null) {
    if (existing.generatingUntil !== undefined && existing.generatingUntil > now) {
      return "in_progress";
    }
    // 再生成の回数 = 累計の生成回数 - 初回の1回
    const regenerations = Math.max(0, (existing.generationCount ?? 1) - 1);
    if (regenerations >= INSIGHT_MAX_REGENERATIONS) {
      return "limit";
    }
    await ctx.db.patch(existing._id, {
      generationCount: (existing.generationCount ?? 1) + 1,
      generatingUntil: now + INSIGHT_RESERVATION_TTL_MS,
    });
    return "reserved";
  }
  // 初回の生成。保存前の予約レコードとして作成し、保存時に本文へ差し替える
  await ctx.db.insert("monthlyInsights", {
    groupId: args.groupId,
    month: args.month,
    commentText: "",
    source: "fallback",
    generatedAt: now,
    generationCount: 1,
    generatingUntil: now + INSIGHT_RESERVATION_TTL_MS,
  });
  return "reserved";
}

export const reserveMonthlyInsightGeneration = internalMutation({
  args: { groupId: v.id("groups"), month: v.string() },
  returns: v.union(v.literal("reserved"), v.literal("in_progress"), v.literal("limit")),
  handler: reserveMonthlyInsightGenerationHandler,
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
