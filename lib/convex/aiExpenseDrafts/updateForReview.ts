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
  // 旧クライアントの送信を拒否しないため受け付けるが、明細を上書きしない。
  const {
    priceTaxTreatment: _priceTaxTreatment,
    taxRateComposition: _taxRateComposition,
    ...review
  } = args;
  const result = await updateAiExpenseDraftForReview(
    { groupId, userId },
    createAiExpenseDraftDeps(ctx),
    review,
  );
  return draftFieldsToDoc(result);
}
