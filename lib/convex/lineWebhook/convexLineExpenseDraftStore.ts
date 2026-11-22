import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
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
        .withIndex("by_created_by_user_id_and_source_type_and_created_at", (q) =>
          q.eq("createdByUserId", createdByUserId).eq("sourceType", "line_text"),
        )
        .filter((q) => q.gte(q.field("createdAt"), sinceMs))
        .order("desc")
        .take(LINE_TEXT_DRAFT_DAILY_LIMIT + 1);
      return rows.map((row) => row.createdAt);
    },
  };
}

/**
 * LINEテキスト入力の支出下書き store。解析を介さないため ready で作成し、
 * Webの既存の下書き確認・登録フローに載せる。
 */
export function createLineExpenseDraftStore(ctx: MutationCtx): LineExpenseDraftStore {
  return {
    ...createLineExpenseDraftReader(ctx),
    async createFromLineText(args: LineExpenseDraftInsert): Promise<void> {
      const draftId = await ctx.db.insert("aiExpenseDrafts", {
        groupId: args.groupId as Id<"groups">,
        createdByUserId: args.createdByUserId,
        sourceType: "line_text",
        // カテゴリ未解決の下書きを ready にすると登録バリデーション
        // (missing_category) を確実に通らず一括登録も止めるため、
        // ユーザーにカテゴリ選択を促す needs_review で作成する。
        status: args.categoryId ? "ready" : "needs_review",
        documentType: "unknown",
        shopName: args.title,
        date: args.date,
        amountYen: args.amountYen,
        categoryId: args.categoryId as Id<"categories"> | undefined,
        confidence: args.categoryId
          ? { amountYen: 1, shopName: 1, date: 1, categoryId: 1 }
          : { amountYen: 1, shopName: 1, date: 1 },
        reviewReasons: args.categoryId
          ? ["user_confirmation_required"]
          : ["missing_required_field", "user_confirmation_required"],
        createdAt: args.now,
        updatedAt: args.now,
      });
      await ctx.db.insert("aiExpenseDraftItems", {
        groupId: args.groupId as Id<"groups">,
        draftId,
        itemName: args.title,
        amountYen: args.amountYen,
        categoryId: args.categoryId as Id<"categories"> | undefined,
        confidence: { amountYen: 1, itemName: 1 },
        createdAt: args.now,
        updatedAt: args.now,
      });
    },
  };
}
