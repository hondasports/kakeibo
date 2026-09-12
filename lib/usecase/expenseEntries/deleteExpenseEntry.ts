import { ConvexError } from "convex/values";
import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { UsecaseGroupContext } from "../context";

export type DeleteExpenseEntryUsecaseArgs = {
  expenseEntryId: string;
};

/** 支出/収入エントリを削除する。所有権を検証する。 */
export async function deleteExpenseEntry(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: { expenseEntries: ExpenseEntryRepository },
  args: DeleteExpenseEntryUsecaseArgs,
): Promise<void> {
  const fields = await deps.expenseEntries.findById(args.expenseEntryId);
  if (fields === null) {
    throw new ConvexError("Expense entry not found");
  }
  const entry = ExpenseEntry.fromPersisted(fields);
  if (!entry.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("Expense entry does not belong to the current group");
  }

  await deps.expenseEntries.delete(args.expenseEntryId);
}
