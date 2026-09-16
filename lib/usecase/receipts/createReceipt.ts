import { Receipt } from "../../domain/receipt/receipt";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";
import type { CreateReceiptInput } from "../../domain/receipt/normalize";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

/**
 * レシート（支出/収入明細）を作成する。
 * 入力検証・weekStartDate 計算・カテゴリ利用可否を経て保存し、ID を返す。
 */
export async function createReceipt(
  ctx: UsecaseGroupContext & { weeklyStartDay: number },
  deps: { receipts: ReceiptRepository; categories: CategoryRepository },
  args: CreateReceiptInput,
): Promise<string> {
  let receipt: Receipt;
  try {
    receipt = Receipt.create(
      args,
      {
        groupId: ctx.groupId,
        createdByUserId: ctx.userId,
        weeklyStartDay: ctx.weeklyStartDay,
      },
      Date.now(),
    );
  } catch (err) {
    throw toConvexError(err, "Invalid receipt");
  }

  await assertUsableCategory(deps.categories, args.categoryId, ctx.groupId, {
    inactiveErrorMessage: "Inactive category cannot be used for new receipts",
  });

  return await deps.receipts.insert(receipt.toInsertFields());
}
