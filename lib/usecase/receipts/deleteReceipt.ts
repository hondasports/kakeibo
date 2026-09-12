import { ConvexError } from "convex/values";
import { Receipt } from "../../domain/receipt/receipt";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { UsecaseGroupContext } from "../context";

export type DeleteReceiptUsecaseArgs = {
  receiptId: string;
};

/** レシートを削除する。所有権を検証する。 */
export async function deleteReceipt(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: { receipts: ReceiptRepository },
  args: DeleteReceiptUsecaseArgs,
): Promise<void> {
  const fields = await deps.receipts.findById(args.receiptId);
  if (fields === null) {
    throw new ConvexError("Receipt not found");
  }
  const receipt = Receipt.fromPersisted(fields);
  if (!receipt.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("Receipt does not belong to the current group");
  }

  await deps.receipts.delete(args.receiptId);
}
