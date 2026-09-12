import { ConvexError } from "convex/values";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AmountBasis, TaxRatePercent } from "../../domain/receipt/tax/types";
import {
  deriveBulkTaxSettings,
  getBulkTaxSettingsErrorMessage,
} from "../../domain/aiExpenseDrafts/applyReceiptTaxSettings";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type {
  DraftOverrideSnapshotService,
  DraftTaxInterpretationService,
} from "../../domain/aiExpenseDrafts/draftWorkflowServices";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import { loadEditableDraft } from "./updateDraftItemTaxOverrides";

export type ApplyReceiptTaxSettingsUsecaseArgs = {
  draftId: string;
  taxRatePercent?: TaxRatePercent | null;
  amountBasis?: AmountBasis;
};

/** 単一税率のレシートへ一括で税設定を適用し、税解釈を再計算して永続化する。 */
export async function applyReceiptTaxSettings(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    taxInterpretation: DraftTaxInterpretationService;
    overrideSnapshots: DraftOverrideSnapshotService;
  },
  args: ApplyReceiptTaxSettingsUsecaseArgs,
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] }> {
  const draft = await loadEditableDraft(deps, ctx.groupId, args.draftId);
  try {
    draft.assertHasTaxInterpretationBasis();
  } catch (err) {
    throw toConvexError(err);
  }

  const taxSummaries = draft.persisted.taxSummaries!;
  if (taxSummaries.length !== 1) {
    throw new ConvexError("Bulk tax settings require a single tax summary");
  }

  const settingsResult = deriveBulkTaxSettings({
    summary: taxSummaries[0],
    taxRatePercent: args.taxRatePercent ?? undefined,
    amountBasis: args.amountBasis,
  });
  if (!settingsResult.success) {
    throw new ConvexError(getBulkTaxSettingsErrorMessage(settingsResult.error));
  }

  const result = await deps.taxInterpretation.persistInterpretation({
    draftId: args.draftId,
    groupId: ctx.groupId,
    bulkUnresolvedOverride: {
      taxRatePercent: settingsResult.taxRatePercent as TaxRatePercent,
      amountBasis: settingsResult.amountBasis,
    },
  });
  const updatedDraft = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: ["items", "receiptTotalResolution", "receiptTaxDecision"],
  });
  return { ...result, draft: updatedDraft };
}
