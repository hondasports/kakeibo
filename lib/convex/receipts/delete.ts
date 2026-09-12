/**
 * deleteReceipt のハンドラグルー。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { deleteReceipt } from "../../usecase/receipts/deleteReceipt";
import { createReceiptRepository } from "./receiptRepository";

export type DeleteReceiptArgs = {
  receiptId: Id<"receipts">;
};

/** deleteReceipt mutation の handler ロジック（テスト用に export） */
export async function deleteReceiptHandler(ctx: MutationCtx, args: DeleteReceiptArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  await deleteReceipt({ groupId }, { receipts: createReceiptRepository(ctx) }, args);
}
