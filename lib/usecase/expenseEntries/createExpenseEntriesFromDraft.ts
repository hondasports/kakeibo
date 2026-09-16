import { ConvexError } from "convex/values";
import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { DraftExpenseEntryInput } from "../../domain/expenseEntries/createFromDraft";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { AiExpenseDraftReader } from "../../domain/aiExpenseDrafts/draftForEntryCreation";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type CreateExpenseEntriesFromDraftUsecaseArgs = {
  draftId: string;
  items: DraftExpenseEntryInput[];
};

/** ready 状態の AI 下書き明細から支出エントリを作成する。 */
export async function createExpenseEntriesFromDraft(
  ctx: UsecaseGroupContext,
  deps: {
    expenseEntries: ExpenseEntryRepository;
    categories: CategoryRepository;
    aiExpenseDrafts: AiExpenseDraftReader;
  },
  args: CreateExpenseEntriesFromDraftUsecaseArgs,
): Promise<string[]> {
  const draft = await deps.aiExpenseDrafts.findById(args.draftId);
  if (draft === null) {
    throw new ConvexError("Draft not found");
  }
  if (draft.groupId !== ctx.groupId) {
    throw new ConvexError("Draft does not belong to the current group");
  }
  if (draft.status !== "ready") {
    throw new ConvexError("Only ready drafts can create expense entries");
  }
  if (!draft.date) {
    throw new ConvexError("Draft date is required");
  }

  const now = Date.now();
  const createdIds: string[] = [];

  for (const item of args.items) {
    let entry: ExpenseEntry;
    try {
      entry = ExpenseEntry.createFromDraftItem(
        {
          groupId: ctx.groupId,
          createdByUserId: ctx.userId,
          draftId: args.draftId,
          draftDate: draft.date,
          draftCategoryId: draft.categoryId,
          item,
        },
        now,
      );
    } catch (err) {
      throw toConvexError(err);
    }

    if (entry.categoryId === undefined) {
      throw new ConvexError("Category ID is required");
    }
    await assertUsableCategory(deps.categories, entry.categoryId, ctx.groupId);
    createdIds.push(await deps.expenseEntries.insert(entry.toInsertFields()));
  }

  return createdIds;
}
