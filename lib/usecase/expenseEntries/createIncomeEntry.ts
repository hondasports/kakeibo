import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type CreateIncomeEntryUsecaseArgs = {
  date: string;
  amountYen: number;
  title: string;
};

/** 手動入力の収入エントリを作成する。作成したエントリの ID を返す。 */
export async function createIncomeEntry(
  ctx: UsecaseGroupContext,
  deps: { expenseEntries: ExpenseEntryRepository },
  args: CreateIncomeEntryUsecaseArgs,
): Promise<string> {
  let entry: ExpenseEntry;
  try {
    entry = ExpenseEntry.createManualIncome(
      {
        groupId: ctx.groupId,
        createdByUserId: ctx.userId,
        date: args.date,
        amountYen: args.amountYen,
        title: args.title,
      },
      Date.now(),
    );
  } catch (err) {
    throw toConvexError(err);
  }

  return await deps.expenseEntries.insert(entry.toInsertFields());
}
