import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { createReceiptHandler } from "../../lib/convex/receipts/insert";
import { updateReceiptHandler } from "../../lib/convex/receipts/update";
import { deleteReceiptHandler } from "../../lib/convex/receipts/delete";

// テスト・crud.ts 互換のためハンドラを再公開する
export { updateReceiptHandler } from "../../lib/convex/receipts/update";
export { deleteReceiptHandler } from "../../lib/convex/receipts/delete";

/**
 * 指定グループ・作成者のレシートだけを削除する（E2E テストデータクリーンアップ専用）。
 * インデックス走査を伴う内部ユーティリティのため、ここに残す。
 */
export async function deleteReceiptsByUserHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; userId: string },
) {
  let deletedCount = 0;
  while (true) {
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_group_id_and_created_by_user_id", (q) =>
        q.eq("groupId", args.groupId).eq("createdByUserId", args.userId),
      )
      .take(500);
    if (receipts.length === 0) break;

    await Promise.all(receipts.map((receipt) => ctx.db.delete(receipt._id)));
    deletedCount += receipts.length;
  }

  return { deletedCount };
}

export const createReceipt = mutation({
  args: {
    date: v.string(),
    type: v.optional(v.union(v.literal("expense"), v.literal("income"))),
    shopName: v.optional(v.string()),
    bankName: v.optional(v.string()),
    amountYen: v.number(),
    categoryId: v.id("categories"),
    memo: v.optional(v.string()),
  },
  handler: createReceiptHandler,
});

export const updateReceipt = mutation({
  args: {
    receiptId: v.id("receipts"),
    date: v.optional(v.string()),
    shopName: v.optional(v.string()),
    bankName: v.optional(v.string()),
    amountYen: v.optional(v.number()),
    categoryId: v.optional(v.id("categories")),
    memo: v.optional(v.string()),
  },
  handler: updateReceiptHandler,
});

export const deleteReceipt = mutation({
  args: {
    receiptId: v.id("receipts"),
  },
  handler: deleteReceiptHandler,
});

/**
 * 指定グループ・作成者のレシートだけを削除する。
 *
 * この mutation は internalMutation として定義されており、外部クライアントから
 * 直接呼び出せない。E2E テスト用の HTTP エンドポイント（convex/http.ts）経由でのみ呼び出す。
 */
export const deleteReceiptsByUser = internalMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.string(),
  },
  handler: deleteReceiptsByUserHandler,
});
