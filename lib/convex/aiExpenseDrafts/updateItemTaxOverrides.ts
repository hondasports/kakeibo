import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { updateDraftItemTaxOverrides } from "../../usecase/aiExpenseDrafts/updateDraftItemTaxOverrides";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc, draftItemFieldsToDoc } from "./draftRecordMapping";
import type { AmountBasis } from "../../receiptTax/types";
import type { ReceiptItemTaxRatePercent } from "../receiptImageExtraction/types";

export type UpdateDraftItemTaxOverridesArgs = {
  draftId: Id<"aiExpenseDrafts">;
  itemId: Id<"aiExpenseDraftItems">;
  taxRatePercent?: ReceiptItemTaxRatePercent;
  amountBasis?: AmountBasis;
};

export type UpdateDraftItemTaxOverridesResult = {
  draft: Doc<"aiExpenseDrafts">;
  items: Doc<"aiExpenseDraftItems">[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/updateDraftItemTaxOverrides。 */
export async function updateDraftItemTaxOverridesHandler(
  ctx: MutationCtx,
  args: UpdateDraftItemTaxOverridesArgs,
  groupId: Id<"groups">,
): Promise<UpdateDraftItemTaxOverridesResult> {
  const result = await updateDraftItemTaxOverrides(
    { groupId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
