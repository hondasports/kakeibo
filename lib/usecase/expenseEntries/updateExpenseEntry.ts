import { ConvexError } from "convex/values";
import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type UpdateExpenseEntryUsecaseArgs = {
  expenseEntryId: string;
  date?: string;
  amountYen?: number;
  categoryId?: string;
  title?: string;
  memo?: string;
};

/** 支出/収入エントリを更新する。所有権・入力値・カテゴリ利用可否を検証する。 */
export async function updateExpenseEntry(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: { expenseEntries: ExpenseEntryRepository; categories: CategoryRepository },
  args: UpdateExpenseEntryUsecaseArgs,
): Promise<string> {
  const fields = await deps.expenseEntries.findById(args.expenseEntryId);
  if (fields === null) {
    throw new ConvexError("Expense entry not found");
  }
  const entry = ExpenseEntry.fromPersisted(fields);
  if (!entry.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("Expense entry does not belong to the current group");
  }

  let patch;
  try {
    patch = entry.buildUpdatePatch(args);
  } catch (err) {
    throw toConvexError(err);
  }

  if (args.categoryId !== undefined) {
    await assertUsableCategory(deps.categories, args.categoryId, ctx.groupId, {
      inactiveErrorMessage: "Inactive category cannot be used for expense entries",
      allowInactiveWhenUnchangedFrom: entry.categoryId,
    });
  }

  await deps.expenseEntries.patch(args.expenseEntryId, { ...patch, updatedAt: Date.now() });
  return args.expenseEntryId;
}
