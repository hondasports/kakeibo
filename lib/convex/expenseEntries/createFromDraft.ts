import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { createCategoryRepository } from "../categories/categoryRepository";
import { createExpenseEntryRepository } from "./expenseEntryRepository";
import { createAiExpenseDraftReader } from "../aiExpenseDrafts/draftReader";
import { createExpenseEntriesFromDraft } from "../../usecase/expenseEntries/createExpenseEntriesFromDraft";
import type { DraftExpenseEntryInput } from "../../domain/expenseEntries/createFromDraft";

type DraftItemArg = DraftExpenseEntryInput<Id<"categories">>;

export type CreateExpenseEntriesFromDraftArgs = {
  draftId: Id<"aiExpenseDrafts">;
  items: DraftItemArg[];
};

export async function createExpenseEntriesFromDraftHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: CreateExpenseEntriesFromDraftArgs,
): Promise<Id<"expenseEntries">[]> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const createdIds = await createExpenseEntriesFromDraft(
    { groupId, userId },
    {
      expenseEntries: createExpenseEntryRepository(ctx),
      categories: createCategoryRepository(ctx),
      aiExpenseDrafts: createAiExpenseDraftReader(ctx),
    },
    args,
  );
  return createdIds as Id<"expenseEntries">[];
}
