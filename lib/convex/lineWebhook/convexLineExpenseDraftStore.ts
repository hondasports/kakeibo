import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  LineExpenseDraftInsert,
  LineExpenseDraftStore,
} from "../../domain/lineWebhook/lineExpenseDraftStore";

/**
 * LINEテキスト入力の支出下書き store。解析を介さないため ready で作成し、
 * Webの既存の下書き確認・登録フローに載せる。
 */
export function createLineExpenseDraftStore(ctx: MutationCtx): LineExpenseDraftStore {
  return {
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
