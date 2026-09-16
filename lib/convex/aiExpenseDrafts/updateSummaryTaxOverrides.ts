import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { updateSummaryTaxOverrides } from "../../usecase/aiExpenseDrafts/updateSummaryTaxOverrides";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc, draftItemFieldsToDoc } from "./draftRecordMapping";
import type { AmountBasis, TaxMode, TaxRatePercent } from "../../receiptTax/types";

export type UpdateSummaryTaxOverridesArgs = {
  draftId: Id<"aiExpenseDrafts">;
  summaryIndex: number;
  taxRatePercent?: TaxRatePercent;
  taxMode?: TaxMode;
  taxableAmountYen?: number;
  taxableAmountBasis?: AmountBasis;
  taxYen?: number;
  taxIncludedAmountYen?: number;
};

export type UpdateSummaryTaxOverridesResult = {
  draft: Doc<"aiExpenseDrafts">;
  items: Doc<"aiExpenseDraftItems">[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/updateSummaryTaxOverrides。 */
export async function updateSummaryTaxOverridesHandler(
  ctx: MutationCtx,
  args: UpdateSummaryTaxOverridesArgs,
  groupId: Id<"groups">,
): Promise<UpdateSummaryTaxOverridesResult> {
  const result = await updateSummaryTaxOverrides({ groupId }, createAiExpenseDraftDeps(ctx), args);
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
