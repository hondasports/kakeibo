import { ConvexError } from "convex/values";
import { getReviewItemReplaceErrorMessage } from "../../domain/aiExpenseDrafts/reviewItemReplace";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { applyRecordPatch } from "../../domain/common/recordPatch";
import {
  buildReceiptUserOverride,
  resolveReceiptTaxCorrections,
  snapshotReceiptDraftValues as snapshotReceiptDraftValuesDomain,
  type ReceiptDraftValueSnapshot,
  type ReceiptUserOverrideSnapshot,
} from "../../domain/aiExpenseDrafts/receiptDataContract";
import { resetReceiptToAiInterpretation } from "../../usecase/aiExpenseDrafts/resetReceiptToAiInterpretation";
import { buildDraftReviewState } from "../../domain/aiExpenseDrafts/draftReviewState";
import { DRAFT_JUDGMENT_ITEM_LIMIT } from "../../domain/aiExpenseDrafts/judgmentItemWindow";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import {
  draftDocToFields,
  draftFieldsToDoc,
  draftItemDocToFields,
  draftItemFieldsToDoc,
} from "./draftRecordMapping";

export function snapshotReceiptDraftValues(
  draft: Doc<"aiExpenseDrafts">,
  items: Doc<"aiExpenseDraftItems">[],
): ReceiptDraftValueSnapshot<Id<"categories">> {
  return snapshotReceiptDraftValuesDomain(draft, items, { includeDiscountTargets: true });
}

export async function persistReceiptUserOverrideSnapshot(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    groupId: Id<"groups">;
    fields: string[];
    updatedAt?: number;
    draft?: AiExpenseDraftFields;
    items?: AiExpenseDraftItemFields[];
  },
): Promise<Doc<"aiExpenseDrafts">> {
  const draft =
    args.draft !== undefined ? draftFieldsToDoc(args.draft) : await ctx.db.get(args.draftId);
  if (draft === null || draft.groupId !== args.groupId) {
    throw new Error("AI expense draft not found while saving user override");
  }
  const storedItems = await ctx.db
    .query("aiExpenseDraftItems")
    .withIndex("by_group_id_and_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("draftId", args.draftId),
    )
    .order("asc")
    .take(DRAFT_JUDGMENT_ITEM_LIMIT + 1);
  if (
    storedItems.length > DRAFT_JUDGMENT_ITEM_LIMIT ||
    (args.items?.length ?? 0) > DRAFT_JUDGMENT_ITEM_LIMIT
  ) {
    throw new ConvexError(getReviewItemReplaceErrorMessage("existing_items_exceed_window"));
  }
  const items = args.items !== undefined ? args.items.map(draftItemFieldsToDoc) : storedItems;
  const updatedAt = args.updatedAt ?? Date.now();
  const receiptUserOverride: ReceiptUserOverrideSnapshot<Id<"categories">> =
    buildReceiptUserOverride({
      existingFields: draft.receiptUserOverride?.fields,
      taxSummaryCorrections: resolveReceiptTaxCorrections(
        draft.receiptUserOverride,
        draft.receiptInterpretation?.values.taxSummaries,
      ),
      fields: args.fields,
      updatedAt,
      values: snapshotReceiptDraftValues(draft, items),
    });
  const updatedDraft = applyRecordPatch(draft as unknown as Record<string, unknown>, {
    receiptUserOverride,
    updatedAt,
  }) as unknown as Doc<"aiExpenseDrafts">;
  // 一覧用の保存サマリは override 適用後の下書きと明細から計算して同じ patch に載せる。
  const state = buildDraftReviewState(
    draftDocToFields(updatedDraft),
    args.items ?? items.map(draftItemDocToFields),
    { reasons: updatedDraft.reviewReasons },
  );
  const reviewPatch =
    updatedDraft.status === "ready" || updatedDraft.status === "needs_review"
      ? { status: state.status, reviewReasons: state.reviewReasons }
      : {};
  await ctx.db.patch(args.draftId, {
    receiptUserOverride,
    updatedAt,
    ...reviewPatch,
    listSummary: state.listSummary,
  });
  return { ...updatedDraft, ...reviewPatch, listSummary: state.listSummary };
}

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/resetReceiptToAiInterpretation。 */
export async function resetReceiptToAiInterpretationHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
  groupId: Id<"groups">,
) {
  const result = await resetReceiptToAiInterpretation(
    { groupId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
