import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { registerReadyDraftsAsExpenseEntries } from "../../usecase/aiExpenseDrafts/registerReadyDraftsAsExpenseEntries";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";

type RegisterReadyDraftsArgs = {
  draftIds: Id<"aiExpenseDrafts">[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/registerReadyDraftsAsExpenseEntries。 */
export async function registerReadyDraftsAsExpenseEntriesHandler(
  ctx: MutationCtx,
  args: RegisterReadyDraftsArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const result = await registerReadyDraftsAsExpenseEntries(
    { groupId, userId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    registeredDraftIds: result.registeredDraftIds as Id<"aiExpenseDrafts">[],
    createdExpenseEntryIds: result.createdExpenseEntryIds as Id<"expenseEntries">[],
    alreadyRegisteredDraftIds: result.alreadyRegisteredDraftIds as Id<"aiExpenseDrafts">[],
  };
}
