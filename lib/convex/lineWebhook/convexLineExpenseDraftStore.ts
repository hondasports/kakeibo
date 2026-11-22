import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AiExpenseDraftReviewReason } from "../../domain/aiExpenseDrafts/constants";
import { buildDraftReviewState } from "../../domain/aiExpenseDrafts/draftReviewState";
import {
  LINE_TEXT_DRAFT_DAILY_LIMIT,
  type LineExpenseDraftInsert,
  type LineExpenseDraftReader,
  type LineExpenseDraftStore,
} from "../../domain/lineWebhook/lineExpenseDraftStore";

/** 日次上限の判定に使う line_text 下書きの読み取り（Query/Mutation 両方で使える）。 */
export function createLineExpenseDraftReader(ctx: QueryCtx | MutationCtx): LineExpenseDraftReader {
  return {
    async lineTextDraftCreatedAtsSince(createdByUserId, sinceMs) {
      const rows = await ctx.db
        .query("aiExpenseDrafts")
        // 範囲条件は index 内の gte で指定する（filter だと全履歴走査になる）
        .withIndex("by_created_by_user_id_and_source_type_and_created_at", (q) =>
          q
            .eq("createdByUserId", createdByUserId)
            .eq("sourceType", "line_text")
            .gte("createdAt", sinceMs),
        )
        .order("desc")
        .take(LINE_TEXT_DRAFT_DAILY_LIMIT + 1);
      return rows.map((row) => row.createdAt);
    },
  };
}

/**
 * LINEテキスト入力の支出下書き store。解析を介さないため内容は確定済みだが、
 * 「確認後登録」のため user_confirmation_required 付きで作成し、
 * Webの既存の下書き確認・登録フローに載せる。
 */
export function createLineExpenseDraftStore(ctx: MutationCtx): LineExpenseDraftStore {
  return {
    ...createLineExpenseDraftReader(ctx),
    async createFromLineText(args: LineExpenseDraftInsert): Promise<void> {
      const reasons: AiExpenseDraftReviewReason[] = args.categoryId
        ? ["user_confirmation_required"]
        : ["missing_required_field", "user_confirmation_required"];
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: args.groupId as Id<"groups">,
        createdByUserId: args.createdByUserId,
        sourceType: "line_text",
        // status / reviewReasons / listSummary は既存の作成経路と同じ
        // buildDraftReviewState で確定するため、ここでは仮値を入れる。
        status: "needs_review",
        documentType: "unknown",
        shopName: args.title,
        date: args.date,
        amountYen: args.amountYen,
        categoryId: args.categoryId as Id<"categories"> | undefined,
        confidence: args.categoryId
          ? { amountYen: 1, shopName: 1, date: 1, categoryId: 1 }
          : { amountYen: 1, shopName: 1, date: 1 },
        reviewReasons: reasons,
        createdAt: args.now,
        updatedAt: args.now,
      });
      const itemId = await ctx.db.insert("aiExpenseDraftItems", {
        groupId: args.groupId as Id<"groups">,
        draftId,
        itemName: args.title,
        amountYen: args.amountYen,
        categoryId: args.categoryId as Id<"categories"> | undefined,
        confidence: { amountYen: 1, itemName: 1 },
        createdAt: args.now,
        updatedAt: args.now,
      });
      const { status, reviewReasons, listSummary } = buildDraftReviewState(
        {
          id: draftId,
          groupId: args.groupId,
          createdByUserId: args.createdByUserId,
          sourceType: "line_text",
          status: "needs_review",
          documentType: "unknown",
          shopName: args.title,
          date: args.date,
          amountYen: args.amountYen,
          categoryId: args.categoryId,
          confidence: args.categoryId
            ? { amountYen: 1, shopName: 1, date: 1, categoryId: 1 }
            : { amountYen: 1, shopName: 1, date: 1 },
          reviewReasons: reasons,
          createdAt: args.now,
          updatedAt: args.now,
        },
        [
          {
            id: itemId,
            groupId: args.groupId,
            draftId,
            itemName: args.title,
            amountYen: args.amountYen,
            categoryId: args.categoryId,
            confidence: { amountYen: 1, itemName: 1 },
            createdAt: args.now,
            updatedAt: args.now,
          },
        ],
        { reasons, preserveUserConfirmation: true },
      );
      await ctx.db.patch(draftId, { status, reviewReasons, listSummary, updatedAt: args.now });
    },
  };
}
