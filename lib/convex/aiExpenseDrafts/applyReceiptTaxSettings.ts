import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { applyReceiptTaxSettings } from "../../usecase/aiExpenseDrafts/applyReceiptTaxSettings";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc, draftItemFieldsToDoc } from "./draftRecordMapping";
import type { AmountBasis, ReceiptItemTaxRatePercent } from "../receiptImageExtraction/types";

export type ApplyReceiptTaxSettingsArgs = {
  draftId: Id<"aiExpenseDrafts">;
  taxRatePercent?: ReceiptItemTaxRatePercent;
  amountBasis?: AmountBasis;
};

export type UpdateDraftItemTaxOverridesResult = {
  draft: Doc<"aiExpenseDrafts">;
  items: Doc<"aiExpenseDraftItems">[];
};

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/applyReceiptTaxSettings。 */
export async function applyReceiptTaxSettingsHandler(
  ctx: MutationCtx,
  args: ApplyReceiptTaxSettingsArgs,
  groupId: Id<"groups">,
): Promise<UpdateDraftItemTaxOverridesResult> {
  const result = await applyReceiptTaxSettings({ groupId }, createAiExpenseDraftDeps(ctx), args);
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
