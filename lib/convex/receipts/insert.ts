import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { getWeeklyStartDayForUser } from "../../../convex/users/weeklySettings";
import type { CreateReceiptInput } from "../../domain/receipt/normalize";
import { createReceipt } from "../../usecase/receipts/createReceipt";
import { createCategoryRepository } from "../categories/categoryRepository";
import { createReceiptRepository } from "./receiptRepository";

export type CreateReceiptArgs = CreateReceiptInput<Id<"categories">>;

/**
 * グループ所属解決済みのコンテキストでレシートを作成する。
 * aiExpenseDrafts 等の別ユースケースからも呼ばれる公開シム。
 */
export async function insertReceiptForGroup(
  ctx: Pick<MutationCtx, "db">,
  groupId: Id<"groups">,
  args: CreateReceiptArgs,
  weekStartDay: number,
  createdByUserId: string,
) {
  return (await createReceipt(
    { groupId, userId: createdByUserId, weeklyStartDay: weekStartDay },
    {
      receipts: createReceiptRepository(ctx),
      categories: createCategoryRepository(ctx),
    },
    args,
  )) as Id<"receipts">;
}

/** createReceipt mutation の handler ロジック（テスト用に export） */
export async function createReceiptHandler(ctx: MutationCtx, args: CreateReceiptArgs) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const weekStartDay = await getWeeklyStartDayForUser(ctx, userId);
  const receiptId = await insertReceiptForGroup(ctx, groupId, args, weekStartDay, userId);

  const receipt = await ctx.db.get(receiptId);
  if (receipt === null) {
    throw new ConvexError("Failed to retrieve created receipt");
  }
  return receipt;
}
