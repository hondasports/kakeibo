/**
 * updateReceipt のハンドラグルー。
 * 認証・依存構築・更新後ドキュメントの読み戻しを行う。
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { updateReceipt } from "../../usecase/receipts/updateReceipt";
import { createCategoryRepository } from "../categories/categoryRepository";
import { createUserSettingsRepository } from "../users/userSettingsRepository";
import { createReceiptRepository } from "./receiptRepository";

export type UpdateReceiptArgs = {
  receiptId: Id<"receipts">;
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  categoryId?: Id<"categories">;
  memo?: string;
};

/** updateReceipt mutation の handler ロジック（テスト用に export） */
export async function updateReceiptHandler(ctx: MutationCtx, args: UpdateReceiptArgs) {
  const { groupId, userId } = await requireGroupMembership(ctx);

  await updateReceipt(
    { groupId, userId },
    {
      receipts: createReceiptRepository(ctx),
      categories: createCategoryRepository(ctx),
      userSettings: createUserSettingsRepository(ctx),
    },
    args,
  );

  const updated = await ctx.db.get(args.receiptId);
  if (updated === null) {
    throw new ConvexError("Failed to retrieve updated receipt");
  }
  return updated;
}
