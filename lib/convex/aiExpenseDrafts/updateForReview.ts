import type { Doc } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { updateAiExpenseDraftForReview } from "../../usecase/aiExpenseDrafts/updateForReview";
import type { UpdateForReviewArgs } from "./reviewValidation";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc } from "./draftRecordMapping";

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/updateForReview。 */
export async function updateForReviewHandler(
  ctx: MutationCtx,
  args: UpdateForReviewArgs,
): Promise<Doc<"aiExpenseDrafts">> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  const result = await updateAiExpenseDraftForReview(
    { groupId, userId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return draftFieldsToDoc(result);
}
