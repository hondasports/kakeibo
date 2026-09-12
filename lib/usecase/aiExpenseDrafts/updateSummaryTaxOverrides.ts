import { ConvexError } from "convex/values";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AmountBasis, TaxMode, TaxRatePercent } from "../../domain/receipt/tax/types";
import { buildDraftSummaryOverride } from "../../domain/receipt/tax/summaryOverrides";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type {
  DraftOverrideSnapshotService,
  DraftTaxInterpretationService,
} from "../../domain/aiExpenseDrafts/draftWorkflowServices";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import { loadEditableDraft } from "./updateDraftItemTaxOverrides";

export type UpdateSummaryTaxOverridesUsecaseArgs = {
  draftId: string;
  summaryIndex: number;
  taxRatePercent?: TaxRatePercent;
  taxMode?: TaxMode;
  taxableAmountYen?: number;
  taxableAmountBasis?: AmountBasis;
  taxYen?: number;
  taxIncludedAmountYen?: number;
};

/** 税内訳サマリ単位のオーバーライドを適用し、税解釈を再計算して永続化する。 */
export async function updateSummaryTaxOverrides(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    taxInterpretation: DraftTaxInterpretationService;
    overrideSnapshots: DraftOverrideSnapshotService;
  },
  args: UpdateSummaryTaxOverridesUsecaseArgs,
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] }> {
  const draft = await loadEditableDraft(deps, ctx.groupId, args.draftId);
  try {
    draft.assertHasTaxInterpretationBasis();
  } catch (err) {
    throw toConvexError(err);
  }

  const taxSummaries = draft.persisted.taxSummaries!;
  if (
    !Number.isInteger(args.summaryIndex) ||
    args.summaryIndex < 0 ||
    args.summaryIndex >= taxSummaries.length
  ) {
    throw new ConvexError("Tax summary index is out of range");
  }

  let summaryOverride;
  try {
    summaryOverride = buildDraftSummaryOverride({
      index: args.summaryIndex,
      taxRatePercent: args.taxRatePercent,
      taxMode: args.taxMode,
      taxableAmountYen: args.taxableAmountYen,
      taxableAmountBasis: args.taxableAmountBasis,
      taxYen: args.taxYen,
      taxIncludedAmountYen: args.taxIncludedAmountYen,
    });
  } catch (err) {
    throw new ConvexError(err instanceof Error ? err.message : "Invalid tax override");
  }

  const result = await deps.taxInterpretation.persistInterpretation({
    draftId: args.draftId,
    groupId: ctx.groupId,
    summaryOverride,
  });
  const updatedDraft = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: ["taxSummaries", "receiptTotalResolution", "receiptTaxDecision"],
  });
  return { ...result, draft: updatedDraft };
}
