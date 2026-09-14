import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  BulkUnresolvedTaxOverride,
  DraftSummaryOverride,
  DraftTaxOverride,
  ReinterpretDraftTaxInput,
} from "../../receiptTax/reinterpretDraftTax";
import type { AiExpenseDraftReviewReason } from "../../../lib/domain/aiExpenseDrafts/constants";
import {
  getTaxInterpretationEligibilityErrorMessage,
  planDraftTaxInterpretation,
  UPDATED_DRAFT_NOT_FOUND_MESSAGE,
  validateTaxInterpretationEligibility,
} from "../../../lib/domain/aiExpenseDrafts/taxInterpretationPlan";
import { draftDocToFields, draftItemDocToFields } from "./draftRecordMapping";

export type PersistDraftTaxInterpretationArgs = {
  draftId: Id<"aiExpenseDrafts">;
  groupId: Id<"groups">;
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
  summaryOverride?: DraftSummaryOverride;
  receiptTotalSource?: "explicit_label" | "user_confirmed" | "ai_estimate";
  decisionOverride?: ReinterpretDraftTaxInput["decisionOverride"];
};

export type PersistDraftTaxInterpretationResult = {
  draft: Doc<"aiExpenseDrafts">;
  items: Doc<"aiExpenseDraftItems">[];
};

export async function persistDraftTaxInterpretation(
  ctx: MutationCtx,
  args: PersistDraftTaxInterpretationArgs,
): Promise<PersistDraftTaxInterpretationResult> {
  const draftDoc = await ctx.db.get(args.draftId);
  const eligibility = validateTaxInterpretationEligibility(
    draftDoc === null ? null : draftDocToFields(draftDoc),
    args.groupId,
    args.decisionOverride,
  );
  if (!eligibility.success) {
    throw new ConvexError(getTaxInterpretationEligibilityErrorMessage(eligibility.error));
  }

  const items = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .collect();

  const now = Date.now();
  const plan = planDraftTaxInterpretation(
    eligibility.draft,
    items.map((item) => ({ ...draftItemDocToFields(item), id: item._id })),
    args,
    now,
  );

  for (const { itemId, patch } of plan.itemPatches) {
    await ctx.db.patch(itemId as Id<"aiExpenseDraftItems">, patch);
  }

  await ctx.db.patch(args.draftId, plan.draftPatch);

  const updatedDraft = await ctx.db.get(args.draftId);
  if (updatedDraft === null) {
    throw new ConvexError(UPDATED_DRAFT_NOT_FOUND_MESSAGE);
  }

  const updatedItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .collect();

  return { draft: updatedDraft, items: updatedItems };
}
