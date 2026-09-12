import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { requireGroupMembership } from "../../../convex/groups/membership";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { updateRegisteredAiExpenseDraft } from "../../usecase/aiExpenseDrafts/updateRegisteredDraft";
import type { UpdateForReviewItem } from "./reviewValidation";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";

export type UpdateRegisteredDraftArgs = {
  draftId: Id<"aiExpenseDrafts">;
  date: string;
  amountYen: number;
  categoryId: Id<"categories">;
  shopName: string;
  memo?: string;
  registrationMode: AiExpenseRegistrationMode;
  items?: UpdateForReviewItem[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/updateRegisteredDraft。 */
export async function updateRegisteredDraftHandler(
  ctx: MutationCtx,
  args: UpdateRegisteredDraftArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const result = await updateRegisteredAiExpenseDraft(
    { groupId, userId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    draftId: result.draftId as Id<"aiExpenseDrafts">,
    expenseEntryIds: result.expenseEntryIds as Id<"expenseEntries">[],
  };
}
