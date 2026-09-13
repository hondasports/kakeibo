/**
 * LineWebhookUserReader の Convex 実装。
 * users テーブルから画像外部API同意時刻だけを読む。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import type { LineWebhookUserReader } from "../../domain/lineWebhook/userReader";

export function createLineWebhookUserReader(ctx: Pick<QueryCtx, "db">): LineWebhookUserReader {
  return {
    async findReceiptImageConsentAcceptedAt(userId) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
        .unique();
      return user?.receiptImageExternalApiConsentAcceptedAt;
    },
  };
}
