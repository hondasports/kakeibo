import { ConvexError } from "convex/values";
import { Receipt } from "../../domain/receipt/receipt";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { UpdateReceiptInput } from "../../domain/receipt/normalize";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { UserSettingsRepository } from "../../domain/users/userSettingsRepository";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type UpdateReceiptUsecaseArgs = { receiptId: string } & UpdateReceiptInput;

/** レシートを更新する。所有権・カテゴリ利用可否・入力値を検証する。 */
export async function updateReceipt(
  ctx: UsecaseGroupContext,
  deps: {
    receipts: ReceiptRepository;
    categories: CategoryRepository;
    userSettings: UserSettingsRepository;
  },
  args: UpdateReceiptUsecaseArgs,
): Promise<void> {
  const fields = await deps.receipts.findById(args.receiptId);
  if (fields === null) {
    throw new ConvexError("Receipt not found");
  }
  const receipt = Receipt.fromPersisted(fields);
  if (!receipt.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("Receipt does not belong to the current group");
  }

  if (args.categoryId !== undefined) {
    await assertUsableCategory(deps.categories, args.categoryId, ctx.groupId, {
      inactiveErrorMessage: "Inactive category cannot be used for new receipts",
      allowInactiveWhenUnchangedFrom: receipt.categoryId,
    });
  }

  // 週開始曜日は date 変更時にだけ必要になる
  const weeklyStartDay =
    args.date !== undefined ? await deps.userSettings.resolveWeeklyStartDay(ctx.userId) : undefined;

  let patch;
  try {
    patch = receipt.buildUpdatePatch(args, weeklyStartDay ?? 0);
  } catch (err) {
    throw toConvexError(err, "Invalid receipt");
  }

  await deps.receipts.patch(args.receiptId, { ...patch, updatedAt: Date.now() });
}
