import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  BulkUnresolvedTaxOverride,
  DraftTaxOverride,
  ReinterpretDraftTaxInput,
} from "../../receiptTax/reinterpretDraftTax";
import type { AiExpenseDraftReviewReason } from "../../../lib/domain/aiExpenseDrafts/constants";
import type { AiExpenseDraftFields } from "../../../lib/domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../../lib/domain/aiExpenseDrafts/aiExpenseDraftItem";
import { applyRecordPatch, diffRecordPatch } from "../../../lib/domain/common/recordPatch";
import {
  getTaxInterpretationEligibilityErrorMessage,
  planDraftTaxInterpretation,
  validateTaxInterpretationEligibility,
} from "../../../lib/domain/aiExpenseDrafts/taxInterpretationPlan";
import {
  draftDocToFields,
  draftItemDocToFields,
  draftFieldsToDoc,
  draftItemFieldsToDoc,
} from "./draftRecordMapping";

export type PersistDraftTaxInterpretationArgs = {
  draftId: Id<"aiExpenseDrafts">;
  groupId: Id<"groups">;
  /** 既に読み込んだ下書き・明細。渡せば DB 再取得を省略する。 */
  draft?: AiExpenseDraftFields;
  items?: AiExpenseDraftItemFields[];
  preservedNonTaxReasons?: AiExpenseDraftReviewReason[];
  override?: DraftTaxOverride;
  bulkUnresolvedOverride?: BulkUnresolvedTaxOverride;
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
  const draftDoc =
    args.draft !== undefined ? draftFieldsToDoc(args.draft) : await ctx.db.get(args.draftId);
  const eligibility = validateTaxInterpretationEligibility(
    draftDoc === null ? null : draftDocToFields(draftDoc),
    args.groupId,
    {
      decisionOverride: args.decisionOverride,
      override: args.override,
      bulkUnresolvedOverride: args.bulkUnresolvedOverride,
    },
  );
  if (!eligibility.success) {
    throw new ConvexError(getTaxInterpretationEligibilityErrorMessage(eligibility.error));
  }

  const items =
    args.items !== undefined
      ? args.items.map(draftItemFieldsToDoc)
      : await ctx.db
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

  const itemDocsById = new Map(items.map((item) => [item._id, item]));
  const itemDiffByItemId = new Map<string, Record<string, unknown>>();
  for (const { itemId, patch } of plan.itemPatches) {
    const id = itemId as Id<"aiExpenseDraftItems">;
    const diff = diffRecordPatch(itemDocsById.get(id) ?? {}, patch);
    if (diff !== null) {
      itemDiffByItemId.set(itemId, diff);
      await ctx.db.patch(id, diff);
    }
  }

  await ctx.db.patch(args.draftId, {
    ...plan.draftPatch,
    receiptInterpretation: plan.draftPatch
      .receiptInterpretation as Doc<"aiExpenseDrafts">["receiptInterpretation"],
  });

  // DB に書いた diff と同じものをメモリ上で doc に適用して組み立て、再読み込みを省く。
  const updatedDraft = applyRecordPatch(
    draftDoc as unknown as Record<string, unknown>,
    plan.draftPatch as Record<string, unknown>,
  ) as unknown as Doc<"aiExpenseDrafts">;
  const updatedItems = items.map((item) => {
    const diff = itemDiffByItemId.get(item._id);
    return diff === undefined
      ? item
      : (applyRecordPatch(
          item as unknown as Record<string, unknown>,
          diff,
        ) as unknown as Doc<"aiExpenseDraftItems">);
  });

  return { draft: updatedDraft, items: updatedItems };
}
